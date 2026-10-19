import { createMiddleware } from 'hono/factory';
import {
  createLogger,
  type Details,
  type DumpLoggerOptions,
  type Logger,
  type RootPayload,
} from 'hierarchical-area-logger';

export type HonoLoggerVariables = {
  logger: Logger;
  eventId: string;
};

/**
 * Minimal environment the logger middleware runs on. The middleware is
 * generic over `E`, so callers can pass their own typed `Bindings` (e.g. a
 * generated `Env`) and get type-safe access to bindings in the
 * configuration resolvers.
 */
export type LoggerEnvironment = {
  Bindings: object;
  Variables: Partial<HonoLoggerVariables>;
};

/**
 * Per-request configuration data passed to `LoggerResolvable` factories.
 *
 * `bindings` are the runtime bindings of the current request (`c.env`).
 * `variables` are the context variables set by middleware registered
 * **before** the logger middleware (e.g. `language` from `i18n`). Variables
 * set after the logger runs are not available yet at configuration time.
 */
export type LoggerResolveContext<
  E extends LoggerEnvironment = LoggerEnvironment,
> = {
  bindings: E['Bindings'];
  variables: E['Variables'];
};

/**
 * A static value or a per-request factory (possibly async) that resolves it.
 * Factories are re-evaluated on every request, which is the recommended way
 * to configure the logger from runtime bindings and context variables.
 */
export type LoggerResolvable<
  T,
  E extends LoggerEnvironment = LoggerEnvironment,
> = T | ((context: LoggerResolveContext<E>) => T | Promise<T>);

export type LoggerConfig<
  AdditionalDetails extends Record<string, unknown> = Record<string, unknown>,
  E extends LoggerEnvironment = LoggerEnvironment,
> = {
  /** Metadata attached to every log entry. May be derived from bindings. */
  details: LoggerResolvable<Details<AdditionalDetails>, E>;
  /** Header name carrying the parent event ID for distributed tracing. */
  parentEventIdHeader?: string;
  /**
   * Event ID factory, called with the resolved `details` and the resolve
   * context. Defaults to `crypto.randomUUID()`. The generated ID is passed
   * to the logger constructor, so it may be produced asynchronously.
   */
  createEventId?: (
    details: Details<AdditionalDetails>,
    context: LoggerResolveContext<E>
  ) => string | Promise<string>;
  /**
   * Default options applied on every `logger.dump()`. May be derived from
   * bindings and variables.
   */
  dumpOptions?: LoggerResolvable<DumpLoggerOptions, E>;
};

/**
 * Logger middleware
 *
 * @description
 * Sets up a `hierarchical-area-logger` for the request and injects it,
 * together with its `eventId`, into the context. Configuration values can be
 * static or resolved per request from runtime bindings (`c.env`) and from
 * variables set by middleware registered before the logger.
 *
 * @param config - Logger configuration
 * @param config.details - Metadata attached to every log entry (static or
 * resolved from bindings)
 * @param [config.parentEventIdHeader] - Header name to read the parent
 * event ID from for distributed tracing
 * @param [config.createEventId] - Event ID factory (defaults to
 * `crypto.randomUUID()`; may be async)
 * @param [config.dumpOptions] - Default options for `logger.dump()` (static
 * or resolved from bindings and variables)
 * @param [config.eventIdHeader] - Response header name that carries the
 * request `eventId` back to the client (defaults to `x-event-id`)
 *
 * @example
 * ```ts
 * app.use('*', logger({
 *   details: ({ bindings }) => ({
 *     instance: 'api-gateway',
 *     environment: bindings.ENVIRONMENT,
 *   }),
 *   parentEventIdHeader: 'parent-event-id',
 *   dumpOptions: ({ bindings }) =>
 *     bindings.ENVIRONMENT === 'production'
 *       ? { excludeLogTypes: ['debug'] }
 *       : {},
 * }));
 * ```
 */
export const logger = <
  E extends LoggerEnvironment = LoggerEnvironment,
  AdditionalDetails extends Record<string, unknown> = Record<string, unknown>,
>(
  config: LoggerConfig<AdditionalDetails, E> & { eventIdHeader?: string }
) =>
  createMiddleware<E & { Variables: HonoLoggerVariables }>(async (c, next) => {
    const context: LoggerResolveContext<E> = {
      bindings: c.env,
      variables: c.var,
    };

    const details =
      typeof config.details === 'function'
        ? await config.details(context)
        : config.details;

    const dumpOptions =
      typeof config.dumpOptions === 'function'
        ? await config.dumpOptions(context)
        : config.dumpOptions;

    const eventId = config.createEventId
      ? await config.createEventId(details, context)
      : crypto.randomUUID();

    const logger = createLogger<AdditionalDetails>({
      details,
      expectParentEventId: !!config.parentEventIdHeader,
      parentEventId: config.parentEventIdHeader
        ? (c.req.header(config.parentEventIdHeader) ?? undefined)
        : undefined,
      path: c.req.path,
      method: c.req.method.toLowerCase() as RootPayload['method'],
      dumpOptions,
      eventId,
    });

    c.set('logger', logger);
    c.set('eventId', logger.eventId);

    c.header(config.eventIdHeader ?? 'x-event-id', logger.eventId);

    await next();
  });
