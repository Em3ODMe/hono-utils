import { z } from 'zod';

/**
 * @description
 * Formats a Zod error as a simple list:
 * `propname: message, anotherprop: message`.
 *
 * @param error - The Zod error to format
 */
export const formatZodError = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');
