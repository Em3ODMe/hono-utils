import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z } from 'zod';

/**
 * @description
 * Validator middleware for JSON data.
 *
 * @param schema - Zod schema for validation
 *
 * @example
 * ```ts
 * app.post('/user', jsonValidator(z.object({
 *   name: z.string(),
 *   age: z.number(),
 * })), (c) => {
 *   const { name, age } = await c.req.valid('json');
 *   return c.json({ name, age });
 * });
 * ```
 */
export const jsonValidator = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
) =>
  validator('json', (value) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: z.prettifyError(parsed.error),
      });
    }
    return parsed.data;
  });
