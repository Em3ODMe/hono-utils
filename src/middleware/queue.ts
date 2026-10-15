import { createMiddleware } from 'hono/factory';
import z, { type ZodObject } from 'zod';
import type { Queue } from '@cloudflare/workers-types';
import { QueueHandler } from '../queue/QueueHandler';
import { HonoLoggerVariables } from './logger';

/** Keys of the worker environment whose value is a Queue binding. */
type QueueBindingKeys<Environment> = {
  [K in keyof Environment & string]: Environment[K] extends Queue ? K : never;
}[keyof Environment & string];

/**
 * Heuristic for detecting a Queue binding value: D1, KV and R2 bindings do
 * not expose `send`/`sendBatch`, so this only matches queues.
 */
const isQueueBinding = (value: unknown): value is Queue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { send?: unknown }).send === 'function' &&
  typeof (value as { sendBatch?: unknown }).sendBatch === 'function';

/**
 * Resolves the queue binding to use. When `name` is provided it is used
 * directly; otherwise the single Queue binding in the environment is
 * auto-detected.
 */
const resolveQueueBinding = (
  env: Record<string, unknown>,
  name: string | undefined
): { key: string; queue: Queue } | undefined => {
  if (name) {
    const queue = env[name] as Queue | undefined;
    return queue ? { key: name, queue } : undefined;
  }

  const matches = Object.entries(env).filter(([, value]) =>
    isQueueBinding(value)
  );

  if (matches.length === 0) {
    return undefined;
  }

  if (matches.length > 1) {
    throw new Error(
      'Multiple queue bindings found in the environment, specify a queue name'
    );
  }

  const [key, queue] = matches[0];
  return { key, queue: queue as Queue };
};

/**
 * Middleware to initialize a Queue producer and attach it to the Hono context.
 * @description
 * This middleware manages Cloudflare Queue interactions. If `finalizeLogHandler` is provided,
 * it will automatically capture the current logger state and send it to the queue after
 * the request is processed (post-`next()`).
 * @param [options.name] - The name of the Queue binding defined in your `wrangler.toml`.
 * Optional: when omitted, the single Queue binding available in the environment is
 * auto-detected. Required when the environment has multiple Queue bindings.
 * @param options.queueHandler - An instance of your custom QueueHandler.
 * @param [options.finalizeLogHandler] - Optional: The specific message type/key to use when finalizing the log.
 * @example
 * ```ts
 * // OPTIONAL
 * app.use('*', logger({
 *  details: { instance: 'api-gateway' },
 *  parentEventIdHeader: 'parent-event-id',
 * }));
 *
 * // The binding name is inferred from the environment
 * app.use('*', queue({
 *  queueHandler: new QueueHandler(),
 *  finalizeLogHandler: 'log'
 * }));
 * ```
 */
export const queue = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Schema extends ZodObject<any>,
  Environment,
  Context,
  Key extends keyof z.infer<Schema>,
>({
  name,
  queueHandler,
  finalizeLogHandler,
}: {
  name?: QueueBindingKeys<Environment> | (string & {});
  queueHandler: QueueHandler<Schema, Environment, Context>;
  finalizeLogHandler?: Key;
}) =>
  createMiddleware<{
    Bindings: Record<string, Queue>;
    Variables: HonoLoggerVariables &
      Record<
        string,
        ReturnType<QueueHandler<Schema, Environment, Context>['getProducer']>
      >;
  }>(async ({ env, set, get }, next) => {
    const resolved = resolveQueueBinding(env as Record<string, unknown>, name);

    if (!resolved) {
      throw new Error(
        name
          ? `Queue environment variable ${name} is not defined`
          : 'No queue binding is available in the environment'
      );
    }

    const { key: bindingKey, queue: queueEnv } = resolved;

    const language = get('language') as unknown as string | undefined;

    const logger = get('logger');

    let parentEventId: string | undefined;

    if (finalizeLogHandler) {
      if (!logger) {
        throw new Error('Logger should be initialized before queue middleware');
      }
      parentEventId = logger?.eventId;
    }

    const producer = queueHandler.getProducer(queueEnv, {
      parentEventId,
      language,
    });
    set(bindingKey, producer);

    await next();

    if (finalizeLogHandler) {
      await producer(
        finalizeLogHandler,
        logger!.dump() as z.infer<Schema>[Key]
      );
    }
  });
