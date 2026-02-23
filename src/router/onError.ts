import { HTTPException } from 'hono/http-exception';
import type { ErrorHandler, Env } from 'hono';
import { defaultMessageMap } from './constants';

export const onError =
  <Environment extends Env>(
    parseError?: (
      err: Error | HTTPException,
      env: Environment['Bindings'],
      get: <K extends keyof Environment['Variables']>(
        key: K
      ) => Environment['Variables'][K]
    ) => Promise<string>
  ): ErrorHandler<Environment> =>
  async (err: Error | HTTPException, { json, env, get }) => {
    try {
      const status =
        'status' in err ? (err.status as HTTPException['status']) : 500;

      return json(
        {
          message: !parseError
            ? err.message
            : ((await parseError(err, env, get)) ??
              defaultMessageMap.internalError),
        },
        status
      );
    } catch (error) {
      console.error('Failed on error handler:', err);
      console.error('Failed to parse error:', error);
      return json({ message: defaultMessageMap.internalError }, 500);
    }
  };
