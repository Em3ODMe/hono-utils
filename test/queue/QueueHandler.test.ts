import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueHandler } from '@/queue/QueueHandler';
import { MAX_RETRY_DELAY_SECONDS } from '@/queue/backoff';
import { z } from 'zod';
import type {
  MessageBatch,
  MessageBatchMetadata,
  Queue,
  QueueMetrics,
} from '@cloudflare/workers-types';
import { ContextFn, GenericQueueData, MessageHandlers } from '@/queue/types';
import type { BatchInfo, BatchMessage } from '@/queue/types';

const mockQueue: Queue<unknown> = {
  send: vi.fn(),
  sendBatch: vi.fn(),
  metrics: async function (): Promise<QueueMetrics> {
    return {} as QueueMetrics;
  },
};

const createEventId = () => 'fixed-event-id';

const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
  /* empty */
});

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
  /* empty */
});

const schema = z.object({
  taskA: z.object({ value: z.string() }),
  taskB: z.object({ count: z.number() }),
});

type Schema = typeof schema;
type SchemaData = z.infer<Schema>;
type Environment = { NAME: string };
type Context = { source: string; envMarker: string };
type QueueData = GenericQueueData<z.infer<Schema>>;
type Handlers = MessageHandlers<z.infer<Schema>, Context>;

let qh: QueueHandler<SchemaData, Environment, Context>;
let env: Environment;

const setContext: ContextFn<Environment, Context> = (
  _env: Environment,
  _message: unknown
) => ({
  source: 'test',
  envMarker: 'ctx',
});

const createMockBatch = (messages: QueueData[], attempts: number[] = []) => {
  const spies = messages.map(() => ({ ack: vi.fn(), retry: vi.fn() }));
  const ackAll = vi.fn();
  const retryAll = vi.fn();
  const batch: MessageBatch<QueueData> = {
    messages: messages.map((msg, index) => ({
      attempts: attempts[index] ?? 0,
      body: msg,
      id: `msg-id-${index}`,
      timestamp: new Date(),
      ack: spies[index].ack,
      retry: spies[index].retry,
    })),
    queue: 'test-queue',
    ackAll,
    retryAll,
    metadata: { metrics: {} as MessageBatchMetadata['metrics'] },
  };
  return { batch, spies, ackAll, retryAll };
};

describe('QueueHandler (Vitest)', () => {
  beforeEach(() => {
    qh = new QueueHandler<SchemaData, Environment, Context>({
      schema,
      setContext,
      createEventId,
    });

    env = { NAME: 'env-test' };

    consoleSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  describe('getConsumer', () => {
    it('executes registered handler with parsed content and context', async () => {
      const calledWith = { content: null as unknown, meta: null as unknown };
      const handlerA = vi.fn<Handlers['taskA']>(
        async (content, { context, metadata }) => {
          calledWith.content = content;
          calledWith.meta = { context, metadata };
        }
      );

      qh.addHandler('taskA', handlerA);
      const consumer = qh.getConsumer();

      const { batch, spies } = createMockBatch([
        {
          handler: 'taskA',
          content: { value: 'hello' },
          eventId: 'fixed-event-id',
        },
      ]);

      await consumer(batch, env);

      expect(handlerA).toHaveBeenCalled();
      expect(calledWith.content).toEqual({ value: 'hello' });
      expect(spies[0].retry).not.toHaveBeenCalled();
    });

    it('logs warning and ack when no handler is registered', async () => {
      const consumer = qh.getConsumer();

      const { batch, spies } = createMockBatch([
        {
          handler: 'unknownTask' as QueueData['handler'],
          content: {} as QueueData['content'],
          eventId: 'fixed-event-id',
        },
      ]);

      await consumer(batch, env);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'No handler registered for handlerName "unknownTask"'
        )
      );
      expect(spies[0].ack).toHaveBeenCalledTimes(1);
    });

    it('awaits an async setContext and passes the RESOLVED context to handlers', async () => {
      // Regression: the consumer must await setContext — an async factory
      // previously leaked a Promise into `{ ...context }`, yielding {} and
      // crashing handlers on `context.<field>` access.
      const asyncQh = new QueueHandler<SchemaData, Environment, Context>({
        schema,
        setContext: async (_env, _params) => ({
          source: 'async-ctx',
          envMarker: 'resolved',
        }),
        createEventId,
      });

      const received: Array<{ context: unknown }> = [];
      asyncQh.addHandler('taskA', async (_content, { context }) => {
        received.push({ context });
      });

      const { batch } = createMockBatch([
        {
          handler: 'taskA',
          content: { value: 'async-context' },
          eventId: 'fixed-event-id',
        },
      ]);

      await asyncQh.getConsumer()(batch, env);

      expect(received).toHaveLength(1);
      expect(received[0].context).toEqual({
        source: 'async-ctx',
        envMarker: 'resolved',
        retry: expect.any(Function),
        ack: expect.any(Function),
      });
    });

    it('processes multiple messages in a batch', async () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      qh.addHandler('taskA', handlerA);
      qh.addHandler('taskB', handlerB);

      const consumer = qh.getConsumer();

      const { batch } = createMockBatch([
        {
          handler: 'taskA',
          content: { value: 'msg1' },
          eventId: 'fixed-event-id',
        },
        { handler: 'taskB', content: { count: 42 }, eventId: 'fixed-event-id' },
        {
          handler: 'taskA',
          content: { value: 'msg3' },
          eventId: 'fixed-event-id',
        },
      ]);

      await consumer(batch, env);

      expect(handlerA).toHaveBeenCalledTimes(2);
      expect(handlerB).toHaveBeenCalledTimes(1);
    });

    it('continues processing other messages if one fails, retrying the failed one', async () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn().mockRejectedValue(new Error('Boom'));

      qh.addHandler('taskA', handlerA);
      qh.addHandler('taskB', handlerB);

      const consumer = qh.getConsumer();

      const { batch, spies } = createMockBatch([
        { handler: 'taskB', content: { count: 1 }, eventId: 'fixed-event-id' }, // Will fail
        {
          handler: 'taskA',
          content: { value: 'ok' },
          eventId: 'fixed-event-id',
        }, // Should succeed
      ]);

      await consumer(batch, env);

      expect(handlerB).toHaveBeenCalled();
      expect(handlerA).toHaveBeenCalled();
      // The failed message must be retried, not silently acked
      expect(spies[0].retry).toHaveBeenCalledTimes(1);
      expect(spies[1].retry).not.toHaveBeenCalled();
    });

    it('retries a message whose content fails schema validation', async () => {
      const handlerA = vi.fn();
      qh.addHandler('taskA', handlerA);

      const consumer = qh.getConsumer();

      const { batch, spies } = createMockBatch([
        {
          handler: 'taskA',
          // Wrong shape: schema expects { value: string }
          content: { value: 123 } as unknown as QueueData['content'],
          eventId: 'fixed-event-id',
        },
      ]);

      await consumer(batch, env);

      expect(handlerA).not.toHaveBeenCalled();
      expect(spies[0].retry).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('retries a message when setContext rejects', async () => {
      const failingQh = new QueueHandler<SchemaData, Environment, Context>({
        schema,
        setContext: async () => {
          throw new Error('Context setup failed');
        },
        createEventId,
      });

      const handlerA = vi.fn();
      failingQh.addHandler('taskA', handlerA);

      const { batch, spies } = createMockBatch([
        {
          handler: 'taskA',
          content: { value: 'ctx-error' },
          eventId: 'fixed-event-id',
        },
      ]);

      await failingQh.getConsumer()(batch, env);

      expect(handlerA).not.toHaveBeenCalled();
      expect(spies[0].retry).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('getConsumer with processAsBatch', () => {
    it('calls the batch handler once with all messages of its name, in batch order', async () => {
      const received: Array<unknown> = [];
      qh.addHandler(
        'taskA',
        async (messages, batchInfo) => {
          received.push(messages, batchInfo);
        },
        { processAsBatch: true }
      );
      const singleHandlerB = vi.fn();
      qh.addHandler('taskB', singleHandlerB);

      const { batch } = createMockBatch([
        { handler: 'taskA', content: { value: 'a1' }, eventId: 'event-1' },
        { handler: 'taskB', content: { count: 1 }, eventId: 'event-2' },
        { handler: 'taskA', content: { value: 'a2' }, eventId: 'event-3' },
      ]);

      await qh.getConsumer()(batch, env);

      expect(received).toHaveLength(2);
      const [messages, batchInfo] = received as [
        BatchMessage<{ value: string }, Context>[],
        BatchInfo,
      ];
      expect(messages.map((item) => item.content)).toEqual([
        { value: 'a1' },
        { value: 'a2' },
      ]);
      expect(batchInfo.queue).toBe('test-queue');
      // The single handler still receives its own message individually
      expect(singleHandlerB).toHaveBeenCalledTimes(1);
    });

    it('preserves per-message metadata and context in batch items', async () => {
      const received: Array<unknown> = [];
      qh.addHandler(
        'taskA',
        async (messages) => {
          received.push(messages);
        },
        { processAsBatch: true }
      );

      const { batch } = createMockBatch([
        {
          handler: 'taskA',
          content: { value: 'a1' },
          eventId: 'event-1',
          parentEventId: 'parent-1',
        },
        { handler: 'taskA', content: { value: 'a2' }, eventId: 'event-2' },
      ]);

      await qh.getConsumer()(batch, env);

      const [messages] = received as [
        BatchMessage<{ value: string }, Context>[],
      ];
      expect(messages[0].metadata.eventId).toBe('event-1');
      expect(messages[0].metadata.parentEventId).toBe('parent-1');
      expect(messages[1].metadata.eventId).toBe('event-2');
      expect(messages[0].context).toEqual({
        source: 'test',
        envMarker: 'ctx',
        retry: expect.any(Function),
        ack: expect.any(Function),
      });
    });

    it('retries an invalid message individually and batches the rest', async () => {
      const batchHandler = vi.fn();
      qh.addHandler('taskA', batchHandler, { processAsBatch: true });

      const { batch, spies } = createMockBatch([
        { handler: 'taskA', content: { value: 'ok' }, eventId: 'event-1' },
        {
          handler: 'taskA',
          content: { value: 123 } as unknown as QueueData['content'],
          eventId: 'event-2',
        },
      ]);

      await qh.getConsumer()(batch, env);

      expect(spies[1].retry).toHaveBeenCalledTimes(1);
      expect(batchHandler).toHaveBeenCalledTimes(1);
      const [messages] = batchHandler.mock.calls[0] as [
        BatchMessage<{ value: string }, Context>[],
        BatchInfo,
      ];
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual({ value: 'ok' });
    });

    it('retries every group message when the batch handler throws', async () => {
      qh.addHandler(
        'taskA',
        async () => {
          throw new Error('Batch boom');
        },
        { processAsBatch: true }
      );

      const { batch, spies } = createMockBatch([
        { handler: 'taskA', content: { value: 'a1' }, eventId: 'event-1' },
        { handler: 'taskA', content: { value: 'a2' }, eventId: 'event-2' },
      ]);

      await qh.getConsumer()(batch, env);

      expect(spies[0].retry).toHaveBeenCalled();
      expect(spies[1].retry).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('passes batch ackAll/retryAll through to the handler', async () => {
      qh.addHandler(
        'taskA',
        async (_messages, batchInfo) => {
          batchInfo.ackAll();
          batchInfo.retryAll();
        },
        { processAsBatch: true }
      );

      const { batch, ackAll, retryAll } = createMockBatch([
        { handler: 'taskA', content: { value: 'a1' }, eventId: 'event-1' },
      ]);

      await qh.getConsumer()(batch, env);

      expect(ackAll).toHaveBeenCalledTimes(1);
      expect(retryAll).toHaveBeenCalledTimes(1);
    });

    it('does not call the batch handler when every message fails parsing', async () => {
      const batchHandler = vi.fn();
      qh.addHandler('taskA', batchHandler, { processAsBatch: true });

      const { batch, spies } = createMockBatch([
        {
          handler: 'taskA',
          content: { value: 123 } as unknown as QueueData['content'],
          eventId: 'event-1',
        },
      ]);

      await qh.getConsumer()(batch, env);

      expect(batchHandler).not.toHaveBeenCalled();
      expect(spies[0].retry).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry backoff', () => {
    it('uses the constructor baseRetryDelaySeconds with exponential backoff', async () => {
      const backoffQh = new QueueHandler<SchemaData, Environment, Context>({
        schema,
        setContext,
        createEventId,
        baseRetryDelaySeconds: 2,
      });
      backoffQh.addHandler(
        'taskA',
        vi.fn().mockRejectedValue(new Error('boom'))
      );

      const { batch, spies } = createMockBatch(
        [{ handler: 'taskA', content: { value: 'x' }, eventId: 'e1' }],
        [3] // attempts
      );

      await backoffQh.getConsumer()(batch, env);

      // 2 ** 3 = 8
      expect(spies[0].retry).toHaveBeenCalledWith({ delaySeconds: 8 });
    });

    it('lets a handler override the base with its own retryDelaySeconds', async () => {
      const backoffQh = new QueueHandler<SchemaData, Environment, Context>({
        schema,
        setContext,
        createEventId,
        baseRetryDelaySeconds: 2,
      });
      backoffQh.addHandler(
        'taskA',
        vi.fn().mockRejectedValue(new Error('boom')),
        { retryDelaySeconds: 5 }
      );

      const { batch, spies } = createMockBatch(
        [{ handler: 'taskA', content: { value: 'x' }, eventId: 'e1' }],
        [2] // attempts
      );

      await backoffQh.getConsumer()(batch, env);

      // 5 ** 2 = 25
      expect(spies[0].retry).toHaveBeenCalledWith({ delaySeconds: 25 });
    });

    it('calls retry without options when no backoff is configured', async () => {
      qh.addHandler('taskA', vi.fn().mockRejectedValue(new Error('boom')));

      const { batch, spies } = createMockBatch([
        { handler: 'taskA', content: { value: 'x' }, eventId: 'e1' },
      ]);

      await qh.getConsumer()(batch, env);

      expect(spies[0].retry).toHaveBeenCalledWith();
    });

    it('clamps the delay to the Cloudflare maximum', async () => {
      const backoffQh = new QueueHandler<SchemaData, Environment, Context>({
        schema,
        setContext,
        createEventId,
        baseRetryDelaySeconds: 2,
      });
      backoffQh.addHandler(
        'taskA',
        vi.fn().mockRejectedValue(new Error('boom'))
      );

      const { batch, spies } = createMockBatch(
        [{ handler: 'taskA', content: { value: 'x' }, eventId: 'e1' }],
        [16] // attempts: 2 ** 16 = 65536, above the 43200 limit
      );

      await backoffQh.getConsumer()(batch, env);

      expect(spies[0].retry).toHaveBeenCalledWith({
        delaySeconds: MAX_RETRY_DELAY_SECONDS,
      });
    });

    it('applies backoff to parse-failure retries and batch group retries', async () => {
      const backoffQh = new QueueHandler<SchemaData, Environment, Context>({
        schema,
        setContext,
        createEventId,
        baseRetryDelaySeconds: 3,
      });
      backoffQh.addHandler(
        'taskA',
        async () => {
          throw new Error('boom');
        },
        { processAsBatch: true }
      );

      const { batch, spies } = createMockBatch(
        [
          { handler: 'taskA', content: { value: 'a1' }, eventId: 'e1' },
          {
            handler: 'taskA',
            content: { value: 123 } as unknown as QueueData['content'],
            eventId: 'e2',
          },
        ],
        [1, 2] // attempts
      );

      await backoffQh.getConsumer()(batch, env);

      // Parse failure: 3 ** 2 = 9
      expect(spies[1].retry).toHaveBeenCalledWith({ delaySeconds: 9 });
      // Group failure: every message retried, 3 ** 1 = 3
      expect(spies[0].retry).toHaveBeenCalledWith({ delaySeconds: 3 });
    });
  });

  describe('getProducer', () => {
    it('creates a producer that sends typed messages to the queue', async () => {
      const sendParams = {
        parentEventId: 'trace-123',
        language: 'en-US',
      };

      const producer = qh.getProducer(mockQueue, sendParams);

      await producer('taskA', { value: 'producer-test' });

      expect(mockQueue.send).toHaveBeenCalledTimes(1);
      expect(mockQueue.send).toHaveBeenCalledWith(
        {
          handler: 'taskA',
          content: { value: 'producer-test' },
          eventId: 'fixed-event-id', // From your existing cuid2 mock
          parentEventId: 'trace-123',
          language: 'en-US',
        },
        { contentType: 'json' }
      );
    });
  });
});
