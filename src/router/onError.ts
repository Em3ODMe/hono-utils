import { HTTPException } from 'hono/http-exception';
import type { ErrorHandler, Env } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
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
      // Only trust an error's `status` when it is a valid HTTP error code
      // (400-599). Arbitrary errors that happen to carry a `status` property
      // (e.g. an upstream fetch failure, `{ status: 0 }`, or a string) would
      // otherwise be misreported with that status instead of a 500.
      const rawStatus = (err as { status?: unknown }).status;
      const status: ContentfulStatusCode =
        typeof rawStatus === 'number' &&
        Number.isInteger(rawStatus) &&
        rawStatus >= 400 &&
        rawStatus <= 599
          ? (rawStatus as ContentfulStatusCode)
          : 500;

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
      console.error('Failed to process error:', err);
      console.error('Failure in error handler:', error);
      return json({ message: defaultMessageMap.internalError }, 500);
    }
  };
