import { Env, Hono, MiddlewareHandler } from 'hono';

export const createMiddlewareTester = <Environment extends Env>(
  variables?: Partial<Environment['Variables']>,
  middleware?: MiddlewareHandler
) => {
  const app = new Hono<Environment>();

  // 1. Setup Phase: Inject Env and Variables
  app.use('*', async (c, next) => {
    // Inject Context Variables
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        c.set(
          key as keyof Environment['Variables'],
          value as Environment['Variables'][keyof Environment['Variables']]
        );
      });
    }

    await next();
  });

  if (middleware) {
    app.use('*', middleware);
  }

  return app;
};
