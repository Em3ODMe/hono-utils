import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type {
  ClientErrorStatusCode,
  ContentfulStatusCode,
  SuccessStatusCode,
} from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';
import type { HonoLoggerVariables } from './logger';

export type HonoResponseVariables = {
  res: ReturnType<typeof setResponseHandlers>;
};

const setResponseHandlers = (c: Context) => {
  const method = c.req.method;

  return {
    raw: <T extends { status?: ContentfulStatusCode }>(data: T) => {
      const { status, ...rest } = data;
      return c.json(rest, status || (200 as ContentfulStatusCode));
    },
    success: <T extends object>(
      message: string,
      data?: T,
      status?: SuccessStatusCode
    ) => {
      const statusCode: ContentfulStatusCode =
        (status as ContentfulStatusCode) || (method === 'POST' ? 201 : 200);

      if (data) {
        return c.json({ message, data }, statusCode);
      }
      return c.json({ message }, statusCode);
    },
    error: (message: string, status: ClientErrorStatusCode) => {
      throw new HTTPException(status, {
        message,
      });
    },
    websocket: (socket: WebSocket) => {
      return new Response(null, {
        status: 101,
        webSocket: socket,
      });
    },
  };
};

/**
 * Response Middleware
 * @description
 * Injects a `res` object into the Hono context (`c.var.res`).
 * This ensures all outgoing responses follow a consistent schema and include
 * tracing metadata (like `eventId`) automatically.
 * @example
 * ```ts
 * app.use('*', response());
 * ```
 */
export const response = createMiddleware<{
  Variables: HonoResponseVariables & HonoLoggerVariables;
}>(async (c, next) => {
  c.set('res', setResponseHandlers(c));
  c.header('x-event-id', c.var.eventId);
  await next();
});
