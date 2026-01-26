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
      const content = { ...rest };
      return c.json(content, status || (200 as ContentfulStatusCode));
    },
    success: <T extends object>(
      message: string,
      data?: T,
      status?: SuccessStatusCode
    ) => {
      const statusCode: ContentfulStatusCode =
        (status as ContentfulStatusCode) || (method === 'POST' ? 201 : 200);

      if (data) {
        const content = { message, data } as {
          message: string;
          data: T;
        };
        return c.json(content, statusCode);
      }
      const content = { message } as {
        message: string;
      };
      return c.json(content, statusCode);
    },
    error: (message: string, status: ClientErrorStatusCode) => {
      const content = { message } as {
        message: string;
      };
      throw new HTTPException(status, {
        message: content.message,
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
