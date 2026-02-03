import { HTTPException } from 'hono/http-exception';
import type { ErrorHandler } from 'hono';
import { defaultMessageMap } from './constants';

export const onError =
  <
    Bindings extends Record<string, unknown>,
    Variables extends Record<string, unknown>,
  >(
    parseError?: (
      err: Error,
      env: Bindings,
      get: <K extends keyof Variables>(key: K) => Variables[K]
    ) => Promise<string>
  ): ErrorHandler =>
  async (err: Error, { json, env, get }) => {
    try {
      const status =
        'status' in err ? (err.status as HTTPException['status']) : 500;

      return json(
        {
          message: !parseError ? err.message : await parseError(err, env, get),
        },
        status
      );
    } catch (error) {
      console.error('Failed on error handler:', err);
      console.error('Failed to parse error:', error);
      return json({ message: defaultMessageMap.internalError }, 500);
    }
  };
