import type { Context, Env } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Logger } from 'hierarchical-area-logger';

export type WrappableMiddleware<V extends Env> = (
  c: Context<V>,
  loggerFunctions: ReturnType<Logger['getArea']> &
    Pick<Logger, 'eventId' | 'parentEventId' | 'dump'>
) => Promise<void>;

/**
 * Wraps middleware with logger. Logger should be initialized before middleware.
 *
 * @param name - Name of the middleware
 * @param middleware - Middleware function
 *
 * @example
 * ```ts
 * app.use('*', logger(
 * {
 *   service: 'logger',
 * },
 * parentEventIdHeader: 'parent-event-id',
 * ));
 *
 * app.use('*', withLogger('middlewareName', (c, { info }) => {
 *   info('Middleware initialized');
 * }));
 * ```
 */
export const withLogger = <V extends Env>(
  name: string,
  middleware: WrappableMiddleware<V>
) =>
  createMiddleware(async (c, next) => {
    const logger = c.get('logger') as Logger | undefined;

    if (!logger) {
      throw new Error('Logger should be initialized');
    }

    const loggerFunctions = logger.getArea(`middleware:${name}`);
    await middleware(c, {
      ...loggerFunctions,
      eventId: logger.eventId,
      parentEventId: logger.parentEventId,
      dump: logger.dump,
    });
    await next();
  });
