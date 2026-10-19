import { createMiddleware } from 'hono/factory';
import type { Queue } from '@cloudflare/workers-types';
import { QueueHandler } from '../queue/QueueHandler';
import type { DataShape } from '../queue/types';
import { HonoLoggerVariables } from './logger';

/** Keys of the worker environment whose value is a Queue binding. */
type QueueBindingKeys<Environment extends Record<string, unknown>> = {
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

/** Bindings exposed to the queue middleware and its finalization callback. */
type QueueMiddlewareBindings<Environment extends Record<string, unknown>> =
  Environment & Record<string, Queue>;

/** Variables set by the queue middleware on the Hono context. */
type QueueMiddlewareVariables<
  Schema extends DataShape,
  Environment extends Record<string, unknown>,
  Context,
> = HonoLoggerVariables &
  Record<
    string,
    ReturnType<QueueHandler<Schema, Environment, Context>['getProducer']>
  >;

/**
 * Context passed to the `callOnFinalization` callback once the request has
 * completed. `get` reads context variables (producer, logger, event ID, ...)
 * and `env` exposes the environment bindings (including the queue bindings).
 */
export type QueueFinalizationContext<
  Schema extends DataShape,
  Environment extends Record<string, unknown>,
  Context,
> = {
  get: <K extends keyof QueueMiddlewareVariables<Schema, Environment, Context>>(
    key: K
  ) => QueueMiddlewareVariables<Schema, Environment, Context>[K];
  env: QueueMiddlewareBindings<Environment>;
};

/**
 * Middleware to initialize a Queue producer and attach it to the Hono context.
 * @description
 * This middleware manages Cloudflare Queue interactions. If `callOnFinalization` is
 * provided, it is invoked after the request has been processed (post-`next()`),
 * receiving the queue producer and the Hono context's `get` and `env` helpers.
 * @param [options.name] - The name of the Queue binding defined in your `wrangler.toml`.
 * Optional: when omitted, the single Queue binding available in the environment is
 * auto-detected. Required when the environment has multiple Queue bindings.
 * @param options.queueHandler - An instance of your custom QueueHandler.
 * @param [options.callOnFinalization] - Optional: A callback invoked after the request is
 * processed. It receives the queue producer and `{ get, env }` so it can send a final
 * message and read context variables (e.g. the logger) and the environment bindings.
 * @example
 * ```ts
 * // OPTIONAL
 * app.use('*', logger({
 *  details: { instance: 'api-gateway' },
 *  parentEventIdHeader: 'parent-event-id',
 * }));
 *
 * app.use('*', queue({
 *  queueHandler: new QueueHandler(),
 *  callOnFinalization: async (producer, { get }) => {
 *    await producer('log', get('logger').dump());
 *  },
 * }));
 * ```
 */
export const queue = <
  Schema extends DataShape,
  Environment extends Record<string, unknown>,
  Context,
>({
  name,
  queueHandler,
  callOnFinalization,
}: {
  name?: QueueBindingKeys<Environment> | (string & {});
  queueHandler: QueueHandler<Schema, Environment, Context>;
  callOnFinalization?: (
    queueProducer: ReturnType<
      QueueHandler<Schema, Environment, Context>['getProducer']
    >,
    context: QueueFinalizationContext<Schema, Environment, Context>
  ) => Promise<void>;
}) =>
  createMiddleware<{
    Bindings: QueueMiddlewareBindings<Environment>;
    Variables: QueueMiddlewareVariables<Schema, Environment, Context>;
  }>(async ({ env, set, get }, next) => {
    const resolved = resolveQueueBinding(env, name);

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

    if (logger) {
      parentEventId = logger?.eventId;
    }

    const producer = queueHandler.getProducer(queueEnv, {
      parentEventId,
      language,
    });
    set(bindingKey, producer);

    await next();

    if (callOnFinalization) {
      await callOnFinalization(producer, { get, env });
    }
  });
