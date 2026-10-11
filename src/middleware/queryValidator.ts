import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z } from 'zod';

/**
 * @description
 * Validator middleware for query data.
 *
 * @param schema - Zod schema for validation
 *
 * @example
 * ```ts
 * app.get('/user', queryValidator(z.object({
 *   name: z.string(),
 *   age: z.number(),
 * })), (c) => {
 *   const { name, age } = await c.req.valid('query');
 *   return c.json({ name, age });
 * });
 * ```
 */
export const queryValidator = <T extends z.ZodObject<z.ZodRawShape>>(
  schema: T
) =>
  validator('query', (value) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: z.prettifyError(parsed.error),
      });
    }
    return parsed.data;
  });
