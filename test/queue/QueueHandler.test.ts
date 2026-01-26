import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueHandler } from '../../src/queue/QueueHandler';
import { z } from 'zod';
import type { MessageBatch, Queue } from '@cloudflare/workers-types';
import { ContextFn, GenericQueueData, MessageHandlers } from '@/queue/types';

vi.mock('@paralleldrive/cuid2', () => ({
  init: () => () => 'fixed-event-id',
}));

const mockQueue: Queue<unknown> = {
  send: vi.fn(),
  sendBatch: vi.fn(),
};

const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
  /* empty */
});

const schema = z.object({
  taskA: z.object({ value: z.string() }),
  taskB: z.object({ count: z.number() }),
});

type Schema = typeof schema;
type Environment = { NAME: string };
type Context = { source: string; envMarker: string };
type QueueData = GenericQueueData<z.infer<Schema>>;
type Handlers = MessageHandlers<z.infer<Schema>, Context>;

let qh: QueueHandler<Schema, Environment, Context>;
let env: Environment;

const setContext: ContextFn<Environment, Context> = (
  _env: Environment,
  _message: unknown
) => ({
  source: 'test',
  envMarker: 'ctx',
});

const createMockBatch = (messages: QueueData[]): MessageBatch<QueueData> => ({
  messages: messages.map((msg) => ({
    attempts: 0,
    body: msg,
    id: 'msg-id',
    timestamp: new Date(),
    ack: vi.fn(),
    retry: vi.fn(),
  })),
  queue: 'test-queue',
  ackAll: vi.fn(),
  retryAll: vi.fn(),
});

describe('QueueHandler (Vitest)', () => {
  beforeEach(() => {
    qh = new QueueHandler<Schema, Environment, Context>({
      schema,
      setContext,
    });

    env = { NAME: 'env-test' };

    consoleSpy.mockReset();
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

      const batch = createMockBatch([
        {
          handler: 'taskA',
          content: { value: 'hello' },
          eventId: 'fixed-event-id',
        },
      ]);

      await consumer(batch, env);

      expect(handlerA).toHaveBeenCalled();
      expect(calledWith.content).toEqual({ value: 'hello' });
    });

    it('logs warning when no handler is registered', async () => {
      const consumer = qh.getConsumer();

      const batch = createMockBatch([
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
    });

    it('processes multiple messages in a batch', async () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      qh.addHandler('taskA', handlerA);
      qh.addHandler('taskB', handlerB);

      const consumer = qh.getConsumer();

      const batch = createMockBatch([
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

    it('continues processing other messages if one fails', async () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn().mockRejectedValue(new Error('Boom'));

      qh.addHandler('taskA', handlerA);
      qh.addHandler('taskB', handlerB);

      const consumer = qh.getConsumer();

      const batch = createMockBatch([
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
