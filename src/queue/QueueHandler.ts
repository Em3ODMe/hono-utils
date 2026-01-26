import { init } from '@paralleldrive/cuid2';
import type { z, ZodObject } from 'zod';
import type { Queue, MessageBatch } from '@cloudflare/workers-types';
import type {
  GenericQueueData,
  Variables,
  Handler,
  QueueSendParams,
  MessageHandlers,
  ContextFn,
} from './types';

/**
 * A type-safe wrapper for Cloudflare Worker Queues using Zod for validation.
 * * This class orchestrates the relationship between incoming queue messages and
 * specific logic handlers, ensuring that data is validated at the edge before
 * reaching your business logic.
 *
 * @template Schema - The Zod schema defining the message shapes.
 * @template Environment - The Cloudflare Worker environment bindings (Env).
 * @template Context - The application context derived from the environment and message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class QueueHandler<Schema extends ZodObject<any>, Environment, Context> {
  private readonly handlers: Partial<
    MessageHandlers<z.infer<Schema>, Context>
  > = {};

  /**
   * @param config - Configuration object.
   * @param config.schema - The Zod schema used to parse and validate incoming message content.
   * @param config.setContext - A factory function to generate context (e.g., DB connections, logging) for each message.
   */
  constructor(
    private readonly config: {
      schema: Schema;
      setContext: ContextFn<Environment, Context>;
    }
  ) {}

  /**
   * Registers a specific processing function for a given message type (handlerName).
   * * @template {keyof z.infer<Schema>} HandlerName - A specific key defined in your Zod schema.
   * @param handlerName - The key identifying which handler to use.
   * @param handler - The asynchronous logic to execute when this message type is received.
   * @returns The current instance for fluent chaining.
   */
  public addHandler<HandlerName extends keyof z.infer<Schema>>(
    handlerName: HandlerName,
    handler: Handler<z.infer<Schema>[HandlerName], Variables<Context>>
  ): this {
    this.handlers[handlerName] = handler;
    return this;
  }

  /**
   * Generates the Cloudflare Worker queue consumer function.
   * * This handles the batch processing loop, parses the message body against the
   * schema, injects context, and manages concurrency via `Promise.allSettled`.
   * * @returns An async function compatible with the Cloudflare `queue` export.
   */
  public getConsumer() {
    return async (
      batch: MessageBatch<GenericQueueData<z.infer<Schema>>>,
      env: Environment
    ): Promise<void> => {
      await Promise.allSettled(
        batch.messages.map(
          async ({ body: { handler, content, ...restMessage }, ...rest }) => {
            const handlerFunction =
              this.handlers[handler as keyof typeof this.handlers];
            if (!handlerFunction) {
              console.warn(
                `No handler registered for handlerName "${String(handler)}"`
              );
              return;
            }
            const parsedContent = this.config.schema.shape[
              handler as keyof typeof this.config.schema.shape
            ].parse(content) as z.infer<Schema>[typeof handler];
            const { retry, ack, ...metadata } = rest;
            const context = this.config.setContext(env, restMessage);
            await handlerFunction(parsedContent, {
              context: { ...context, retry, ack },
              metadata: {
                ...restMessage,
                handler: handler as string,
                ...metadata,
              },
            });
          }
        )
      );
    };
  }

  /**
   * Creates a factory function for sending typed messages to a specific queue.
   * * @param queue - The Cloudflare Queue binding (e.g., `env.MY_QUEUE`).
   * @param params - Global parameters to include in every message (e.g., trace IDs).
   * @returns A producer function that accepts a `handler` key and the corresponding typed content.
   */
  public getProducer(queue: Queue<unknown>, params: QueueSendParams) {
    const createId = init({ fingerprint: 'queue' });
    return async <HandlerName extends keyof z.infer<Schema>>(
      handler: HandlerName,
      content: z.infer<Schema>[HandlerName]
    ) => {
      const eventId = createId();
      return queue.send(
        { content, handler, eventId, ...params } as GenericQueueData<
          z.infer<Schema>
        >,
        { contentType: 'json' }
      );
    };
  }
}
