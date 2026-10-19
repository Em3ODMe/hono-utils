import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type {
  ClientErrorStatusCode,
  ContentfulStatusCode,
  ContentlessStatusCode,
} from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';
import type { WebSocketPair } from '@cloudflare/workers-types';
import type { HonoLoggerVariables } from './logger';

export type HonoResponseVariables = {
  res: ReturnType<typeof setResponseHandlers>;
};

/** Statuses that may be passed to the response helpers. */
type ResponseStatusCode = ContentfulStatusCode | ContentlessStatusCode;

const setResponseHandlers = (c: Context) => {
  // Statuses that must not carry a response body: `new Response(body, { status: 204 })`
  // throws on Node/undici, so return a null-body response for these instead.
  const NO_ENTITY_STATUS = new Set<ContentlessStatusCode>([204, 205, 304]);

  const jsonWithStatus = <T>(data: T, status: ResponseStatusCode) => {
    return NO_ENTITY_STATUS.has(status as ContentlessStatusCode)
      ? c.body(null, status as ContentfulStatusCode)
      : c.json(data, status as ContentfulStatusCode);
  };

  return {
    raw: <T extends { status?: ResponseStatusCode } & Record<string, unknown>>(
      data: T
    ) => {
      const { status, ...rest } = data;
      return jsonWithStatus(rest, status || 200);
    },
    success: <T extends object>(
      message: string,
      data?: T,
      status?: ResponseStatusCode
    ) => {
      const statusCode: ResponseStatusCode = status || 200;

      return jsonWithStatus({ message, data }, statusCode);
    },
    successNoContent: (message: string, status?: ResponseStatusCode) => {
      const statusCode: ResponseStatusCode = status || 200;
      return jsonWithStatus({ message }, statusCode);
    },
    error: (message: string, status: ClientErrorStatusCode) => {
      // Attach a JSON body so the error shape matches `raw`/`success`
      // regardless of which error handler renders the exception (Hono's
      // default or the library's `onError`).
      throw new HTTPException(status, {
        message,
        res: jsonWithStatus({ message }, status),
      });
    },
    websocket: (pair: InstanceType<typeof WebSocketPair>) => {
      // Cloudflare Workers upgrade pattern: accept the server side of the
      // pair and return the client side in the 101 response.
      return new Response(null, {
        status: 101,
        webSocket: pair[0],
      });
    },
  };
};

/**
 * Response Middleware
 * @description
 * Injects a `res` object into the Hono context (`c.var.res`).
 * This ensures all outgoing responses follow a consistent schema.
 * @example
 * ```ts
 * app.use('*', response);
 * ```
 */
export const response = createMiddleware<{
  Variables: HonoResponseVariables & HonoLoggerVariables;
}>(async (c, next) => {
  c.set('res', setResponseHandlers(c));
  await next();
});
