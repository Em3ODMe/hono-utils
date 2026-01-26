import { createMiddleware } from 'hono/factory';
import { type Details, Logger } from 'hierarchical-area-logger';

export type HonoLoggerVariables = {
  logger: Logger;
  eventId: string;
};

/**
 * Logger middleware
 *
 * @description
 * This middleware sets up a logger.
 *
 * @param details - Details to pass to the logger
 * @param parentEventIdHeader - Header name to use for parent event ID
 *
 * @example
 * ```ts
 * app.use('*', logger(
 * {
 *   service: 'logger',
 * },
 * parentEventIdHeader: 'parent-event-id',
 * ));
 * ```
 */
export const logger = (details: Details, parentEventIdHeader?: string) =>
  createMiddleware<{
    Variables: HonoLoggerVariables;
  }>(async (c, next) => {
    const logger = new Logger({
      details,
      withParentEventId: !!parentEventIdHeader,
      parentEventId: parentEventIdHeader
        ? (c.req.raw.headers.get(parentEventIdHeader) ?? undefined)
        : undefined,
      defaultArea: new URL(c.req.raw.url).pathname,
    });

    c.set('logger', logger);
    c.set('eventId', logger.eventId);

    await next();
  });
