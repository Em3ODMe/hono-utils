import { hc } from 'hono/client';
import { parseResponse, DetailedError } from 'hono/client';
import type { ClientResponse } from 'hono/client';
import type { Hono } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';

type ErrorBody = Record<string, unknown>;

interface TypedClientCallbacks {
  onStart?: () => void;
  onSuccess?: (parsedData: unknown, headers: Headers) => void;
  onError?: (parsedData: unknown, headers: Headers) => void;
  onEnd?: () => void;
  errorHandler?: (status: StatusCode | number, body?: ErrorBody) => never;
}

export interface CreateTypedClientOptions {
  url: string;
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  fetch?: typeof fetch;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createTypedClient = <TApp extends Hono<any, any, any>>() => {
  return (options: CreateTypedClientOptions) =>
    async <TSuccessData>(
      fn: (
        c: ReturnType<typeof hc<TApp>>
      ) => Promise<ClientResponse<TSuccessData>>,
      callbacks?: TypedClientCallbacks
    ): Promise<TSuccessData> => {
      const client = hc<TApp>(options.url, {
        headers: options.headers,
        fetch: options.fetch,
      });
      callbacks?.onStart?.();

      // We keep a reference to headers to use them in the catch block if needed
      let responseHeaders: Headers = new Headers();

      try {
        // 1. Execute the raw request
        const response = await fn(client);
        responseHeaders = response.headers;

        // 2. Use Hono's native parseResponse
        // This automatically:
        // - Checks response.ok (throws DetailedError if false)
        // - Parses JSON/Text based on Content-Type
        const data = await parseResponse(response);

        // 3. Handle Success
        callbacks?.onSuccess?.(data, responseHeaders);
        return data as TSuccessData;
      } catch (err) {
        // 4. Handle Errors
        const errorBody: ErrorBody = { message: (err as Error).message };
        let status: ContentfulStatusCode = 500;

        if (err instanceof DetailedError) {
          const { detail, statusCode } = err as {
            detail?: TSuccessData;
            statusCode?: ContentfulStatusCode;
          };
          // DetailedError is thrown by parseResponse when !response.ok
          status = statusCode ?? 500;

          if (!detail) {
            callbacks?.errorHandler?.(500, {
              message: 'Fetch malformed',
            });
            throw new HTTPException(500, { message: 'Fetch malformed' });
          }
        }

        callbacks?.onError?.(errorBody, responseHeaders);
        callbacks?.errorHandler?.(status, errorBody);

        throw new HTTPException(status, errorBody);
      } finally {
        callbacks?.onEnd?.();
      }
    };
};
