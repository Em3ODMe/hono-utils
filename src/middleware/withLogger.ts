import { createMiddleware } from 'hono/factory';
import type { Context, Env, MiddlewareHandler } from 'hono';
import type { Logger } from 'hierarchical-area-logger';
import { HonoLoggerVariables } from './logger';

/**
 * The scoped logging API handed to middleware wrapped with `withLogger`.
 *
 * It combines the area-scoped log methods (`info`, `warn`, `error`, `log`,
 * `debug`) returned by `Logger#getArea()` with the request logger's
 * `eventId` and the bound `dump`/`dumpFlat` helpers, so the wrapped
 * middleware can both write to its own area and inspect the whole log.
 */
export type LoggerFunctions = ReturnType<Logger['getArea']> &
  Pick<Logger, 'eventId' | 'dump' | 'dumpFlat'>;

/**
 * A middleware implementation that runs with an initialized request logger.
 *
 * It receives the Hono context and a {@link LoggerFunctions} instance scoped
 * to `middleware:${name}`. It should perform its work and return (or throw);
 * it must **not** call `next()` itself — `withLogger` calls `next()` after the
 * wrapped middleware resolves.
 */
export type WrappableMiddleware<E extends Env> = (
  c: Context<E>,
  loggerFunctions: LoggerFunctions
) => void | Promise<void>;

/**
 * Wraps middleware with logging capability.
 *
 * @description
 * `withLogger` creates a middleware that requires the `logger` middleware to
 * have run first (it injects `c.var.logger`). It scopes the request logger to
 * an area named `middleware:${name}` and passes the resulting log methods,
 * together with the request's `eventId` and bound `dump`/`dumpFlat` helpers,
 * to the wrapped middleware. Once the wrapped middleware completes, `next()`
 * is invoked.
 *
 * @param name - Name used to derive the scoped log area (`middleware:${name}`)
 * @param middleware - Middleware implementation receiving the context and the
 * scoped logger functions
 *
 * @throws {Error} When `logger` is not initialized (the `logger` middleware
 * must be registered before any `withLogger` middleware)
 *
 * @example
 * ```ts
 * app.use('*', logger({ details: { instance: 'api' } }));
 *
 * app.use(
 *   '*',
 *   withLogger<Env>('requestId', async (c, { info, eventId }) => {
 *     info('Setting request id', { eventId });
 *     c.set('requestId', eventId);
 *   })
 * );
 * ```
 */
export const withLogger = <E extends Env>(
  name: string,
  middleware: WrappableMiddleware<E & { Variables: HonoLoggerVariables }>
): MiddlewareHandler<E & { Variables: HonoLoggerVariables }> =>
  createMiddleware<E & { Variables: HonoLoggerVariables }>(async (c, next) => {
    const logger = c.get('logger');

    if (!logger) {
      throw new Error('Logger should be initialized before middleware');
    }

    const loggerFunctions = logger.getArea(`middleware:${name}`);

    await middleware(c, {
      ...loggerFunctions,
      eventId: logger.eventId,
      dump: logger.dump.bind(logger),
      dumpFlat: logger.dumpFlat.bind(logger),
    });

    await next();
  });
