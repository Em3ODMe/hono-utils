import { createMiddleware } from 'hono/factory';
import z, { type ZodObject } from 'zod';
import { Logger } from 'hierarchical-area-logger';
import type { Queue } from '@cloudflare/workers-types';
import { QueueHandler } from '../queue/QueueHandler';
import { HonoLoggerVariables } from './logger';

/**
 * Middleware to initialize a Queue producer and attach it to the Hono context.
 * @description
 * This middleware manages Cloudflare Queue interactions. If `finalizeLogHandler` is provided,
 * it will automatically capture the current logger state and send it to the queue after
 * the request is processed (post-`next()`).
 * @param options.name - The name of the Queue binding defined in your `wrangler.toml`.
 * @param options.queueHandler - An instance of your custom QueueHandler.
 * @param [options.finalizeLogHandler] - Optional: The specific message type/key to use when finalizing the log.
 * @example
 * ```ts
 * // OPTIONAL
 * app.use('*', logger(
 *  {
 *   service: 'logger',
 *  },
 *  parentEventIdHeader: 'parent-event-id',
 * ));
 *
 * app.use('*', queue({
 *  name: 'queue',
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
  name: string;
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
    const queueEnv = env[name] as Queue | undefined;

    const language = get('language') as unknown as string | undefined;

    const logger = get('logger') as Logger | undefined;

    if (!queueEnv) {
      throw new Error(
        `Queue environment variable ${name as string} is not defined`
      );
    }

    let parentEventId: string | undefined;

    if (finalizeLogHandler) {
      if (!logger) {
        throw new Error('Logger should be initialized before queue middleware');
      }
      parentEventId = logger.eventId;
    }

    const producer = queueHandler.getProducer(queueEnv, {
      parentEventId,
      language,
    });
    set(name, producer);

    await next();

    if (finalizeLogHandler) {
      await producer(
        finalizeLogHandler,
        logger!.dump() as z.infer<Schema>[Key]
      );
    }
  });
