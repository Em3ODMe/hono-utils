import { createMiddleware } from 'hono/factory';
import { Env } from 'hono';

/**
 * A Hono middleware factory that hydrates a context variable based on environment bindings or other variables.
 * @template {Record<string, unknown>} Bindings - The environment bindings (e.g., Cloudflare Env).
 * @template {Record<string, unknown>} Variables - The Hono context variables.
 * @template HidratedResult - The resulting type of the hydrated variable.
 * @param {Object} options - The configuration options for hydration.
 * @param {keyof Variables} options.variableName - The name of the variable in the context to be set.
 * @param {(c: Bindings & { get: <T>(key: keyof Variables) => T }) => HidratedResult} options.hydrate -
 * A function that takes the environment and a getter, returning the hydrated value.
 * @returns {import("hono").MiddlewareHandler} A Hono middleware that performs the hydration and calls next().
 * @example
 * const middleware = hydrateVariable({
 *   variableName: 'userProfile',
 *   hydrate: (c) => new UserProfile(c.USER_ID)
 * });
 */
export const hydrateVariable = <Environment extends Env, HidratedResult>({
  variableName,
  hydrate,
}: {
  variableName: keyof Environment['Variables'];
  hydrate: (
    c: Environment['Bindings'] & {
      get: <T>(key: keyof Environment['Variables']) => T;
    }
  ) => HidratedResult;
}) =>
  createMiddleware<{
    Bindings: Environment['Bindings'];
    Variables: Record<string, HidratedResult>;
  }>(async ({ set, env, get }, next) => {
    set(variableName as string, hydrate({ ...env, get }));
    await next();
  });
