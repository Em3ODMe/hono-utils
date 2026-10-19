import type {
  Message,
  Queue,
  MessageBatch,
  QueueRetryOptions,
} from '@cloudflare/workers-types';
import { calculateClampedBackoff } from './backoff';
import type {
  BatchHandler,
  BatchHandlers,
  BatchInfo,
  BatchMessage,
  DataShape,
  GenericQueueData,
  Variables,
  Handler,
  QueueSendParams,
  MessageHandlers,
  ContextFn,
  QueueSchema,
} from './types';

/**
 * A type-safe wrapper for Cloudflare Worker Queues using Zod for validation.
 * * This class orchestrates the relationship between incoming queue messages and
 * specific logic handlers, ensuring that data is validated at the edge before
 * reaching your business logic.
 *
 * @template Schema - The **inferred output type** of the Zod schema defining
 * the message shapes (i.e. `z.infer<typeof yourSchema>`). The class is generic
 * over the output rather than the ZodObject itself: deriving types from the
 * plain output shape is cheap, while re-instantiating zod's inference
 * machinery over a concrete schema in every method signature makes the
 * checker OOM on large schemas. The raw schema instance is kept at runtime
 * only (in `config.schema`).
 * @template Environment - The Cloudflare Worker environment bindings (Env).
 * @template Context - The application context derived from the environment and message.
 */
export class QueueHandler<Schema extends DataShape, Environment, Context> {
  private readonly handlers: Partial<MessageHandlers<Schema, Context>> = {};

  private readonly batchHandlers: Partial<BatchHandlers<Schema, Context>> = {};

  /** Per-handler retry delay overrides, keyed by handler name. */
  private readonly handlerRetryDelays: Partial<Record<keyof Schema, number>> =
    {};

  /**
   * @param config - Configuration object.
   * @param config.schema - The Zod schema used to parse and validate incoming message content.
   * @param config.setContext - A factory function to generate context (e.g., DB connections, logging) for each message.
   * @param [config.baseRetryDelaySeconds] - The base for the exponential backoff applied
   * to every retry (`delaySeconds = base ** attempts`). Individual handlers can override
   * it via `addHandler`'s `retryDelaySeconds` option.
   */
  constructor(
    private readonly config: {
      schema: QueueSchema<Schema>;
      setContext: ContextFn<Environment, Context>;
      createEventId: () => string;
      baseRetryDelaySeconds?: number;
    }
  ) {}

  /**
   * Resolves the `QueueRetryOptions` for a message: the per-handler override
   * wins over the constructor's `baseRetryDelaySeconds`. Returns `undefined`
   * when no backoff is configured (plain `retry()`).
   */
  private getRetryOptions(
    message: Message<GenericQueueData<Schema>>,
    handlerName: string
  ): QueueRetryOptions | undefined {
    const delaySeconds =
      this.handlerRetryDelays[
        handlerName as keyof typeof this.handlerRetryDelays
      ] ?? this.config.baseRetryDelaySeconds;

    if (delaySeconds === undefined) {
      return undefined;
    }

    return {
      delaySeconds: calculateClampedBackoff(message.attempts, delaySeconds),
    };
  }

  /**
   * Registers a specific processing function for a given message type (handlerName).
   * * @template {keyof Schema} HandlerName - A specific key defined in your Zod schema.
   * @param handlerName - The key identifying which handler to use.
   * @param handler - The asynchronous logic to execute when this message type is received.
   * @param [options] - Registration options.
   * @param [options.processAsBatch] - When `true`, the handler receives **all** messages of
   * this type within a consumer batch in a single call (`BatchHandler`). Defaults to `false`.
   * @param [options.retryDelaySeconds] - Base for the exponential backoff applied when this
   * handler's messages are retried (`delaySeconds = base ** attempts`). Overrides the
   * constructor's `baseRetryDelaySeconds` for this handler.
   * @returns The current instance for fluent chaining.
   */
  public addHandler<HandlerName extends keyof Schema>(
    handlerName: HandlerName,
    handler: Handler<Schema[HandlerName], Variables<Context>>,
    options?: { processAsBatch?: false; retryDelaySeconds?: number }
  ): this;
  public addHandler<HandlerName extends keyof Schema>(
    handlerName: HandlerName,
    handler: BatchHandler<Schema[HandlerName], Context>,
    options: { processAsBatch: true; retryDelaySeconds?: number }
  ): this;
  public addHandler<HandlerName extends keyof Schema>(
    handlerName: HandlerName,
    handler:
      | Handler<Schema[HandlerName], Variables<Context>>
      | BatchHandler<Schema[HandlerName], Context>,
    options: {
      processAsBatch?: boolean;
      retryDelaySeconds?: number;
    } = {}
  ): this {
    if (options.processAsBatch) {
      this.batchHandlers[handlerName] = handler as BatchHandler<
        Schema[HandlerName],
        Context
      >;
    } else {
      this.handlers[handlerName] = handler as Handler<
        Schema[HandlerName],
        Variables<Context>
      >;
    }

    if (options.retryDelaySeconds !== undefined) {
      this.handlerRetryDelays[handlerName] = options.retryDelaySeconds;
    }

    return this;
  }

  /**
   * Generates the Cloudflare Worker queue consumer function.
   * * This handles the batch processing loop, groups messages by handler name,
   * parses the message body against the schema, injects context, and manages
   * concurrency via `Promise.allSettled`.
   * * @returns An async function compatible with the Cloudflare `queue` export.
   */
  public getConsumer() {
    return async (
      batch: MessageBatch<GenericQueueData<Schema>>,
      env: Environment
    ): Promise<void> => {
      // Group messages by handler name, preserving batch order within each group.
      const groups = new Map<string, Message<GenericQueueData<Schema>>[]>();
      for (const message of batch.messages) {
        const name = String(message.body.handler);
        const group = groups.get(name);
        if (group) {
          group.push(message);
        } else {
          groups.set(name, [message]);
        }
      }

      await Promise.allSettled(
        Array.from(groups, async ([handlerName, messages]) => {
          const batchHandler =
            this.batchHandlers[handlerName as keyof typeof this.batchHandlers];

          if (batchHandler) {
            await this.processBatch(batchHandler, messages, env, batch);
            return;
          }

          // Not a batch handler: process each message individually (or warn
          // and ack it when no handler is registered).
          await Promise.allSettled(
            messages.map((message) => this.processMessage(message, env))
          );
        })
      );
    };
  }

  /**
   * Processes a single message through its registered handler.
   */
  private async processMessage(
    message: Message<GenericQueueData<Schema>>,
    env: Environment
  ): Promise<void> {
    const {
      body: { handler, content, ...restMessage },
      ...rest
    } = message;
    const { retry, ack, ...metadata } = rest;

    try {
      const handlerFunction =
        this.handlers[handler as keyof typeof this.handlers];
      if (!handlerFunction) {
        console.warn(
          `No handler registered for handlerName "${String(handler)}"`
        );
        ack();
        return;
      }
      const parsedContent = this.config.schema.shape[
        handler as keyof typeof this.config.schema.shape
      ].parse(content) as Schema[typeof handler];
      // `setContext` may be async (e.g. secret resolution, DB setup):
      // await it so handlers receive the RESOLVED context, not a Promise.
      const context = await this.config.setContext(env, restMessage);
      await handlerFunction(parsedContent, {
        context: { ...context, retry, ack },
        metadata: {
          ...restMessage,
          handler: handler as string,
          ...metadata,
        },
      });
    } catch (error) {
      // Swallowing the error would make the batch resolve successfully,
      // causing Cloudflare to ack the failed message and never redeliver
      // it. Explicitly signal a retry so the message is not lost.
      console.error(
        `Failed to process message for handlerName "${String(handler)}":`,
        error
      );
      const retryOptions = this.getRetryOptions(message, String(handler));
      if (retryOptions) {
        retry(retryOptions);
      } else {
        retry();
      }
    }
  }

  /**
   * Processes all messages of one handler name in a single batch call.
   */
  private async processBatch(
    batchHandler: BatchHandler<Schema[keyof Schema], Context>,
    messages: Array<Message<GenericQueueData<Schema>>>,
    env: Environment,
    batch: MessageBatch<GenericQueueData<Schema>>
  ): Promise<void> {
    const handlerName = String(messages[0].body.handler);

    const items: BatchMessage<Schema[keyof Schema], Context>[] = [];

    for (const message of messages) {
      const {
        body: { handler, content, ...restMessage },
        ...rest
      } = message;
      const { retry, ack, ...metadata } = rest;

      let parsedContent: Schema[keyof Schema];
      try {
        parsedContent = this.config.schema.shape[
          handler as keyof typeof this.config.schema.shape
        ].parse(content) as Schema[typeof handler];
      } catch (error) {
        // A poison message must not block the whole group: retry it
        // individually and exclude it from the batch call.
        console.error(
          `Failed to parse message for handlerName "${String(handler)}":`,
          error
        );
        const retryOptions = this.getRetryOptions(message, String(handler));
        if (retryOptions) {
          retry(retryOptions);
        } else {
          retry();
        }
        continue;
      }

      // `setContext` may be async (e.g. secret resolution, DB setup):
      // await it so handlers receive the RESOLVED context, not a Promise.
      const context = await this.config.setContext(env, restMessage);

      items.push({
        content: parsedContent,
        context: { ...context, retry, ack },
        metadata: {
          ...restMessage,
          handler: handler as string,
          ...metadata,
        },
      });
    }

    if (items.length === 0) {
      // Every message failed parsing and has already been retried.
      return;
    }

    const batchInfo: BatchInfo = {
      queue: batch.queue,
      ackAll: () => batch.ackAll(),
      retryAll: () => batch.retryAll(),
    };

    try {
      await batchHandler(items, batchInfo);
    } catch (error) {
      console.error(
        `Failed to process batch for handlerName "${handlerName}":`,
        error
      );
      // At-least-once semantics: redeliver every message of the group.
      for (const message of messages) {
        const retryOptions = this.getRetryOptions(message, handlerName);
        if (retryOptions) {
          message.retry(retryOptions);
        } else {
          message.retry();
        }
      }
    }
  }

  /**
   * Creates a factory function for sending typed messages to a specific queue.
   * @param queue - The Cloudflare Queue binding (e.g., `env.MY_QUEUE`).
   * @param params - Global parameters to include in every message (e.g., trace IDs).
   * @returns A producer function that accepts a `handler` key and the corresponding typed content.
   */
  public getProducer(queue: Queue<unknown>, params: QueueSendParams) {
    return async <HandlerName extends keyof Schema>(
      handler: HandlerName,
      content: Schema[HandlerName]
    ) => {
      const eventId = this.config.createEventId();
      return queue.send(
        { content, handler, eventId, ...params } as GenericQueueData<Schema>,
        { contentType: 'json' }
      );
    };
  }
}
