import { HTTPException } from 'hono/http-exception';
import type { ErrorHandler } from 'hono';
import { defaultMessageMap } from './constants';
import { Logger } from 'hierarchical-area-logger';

export const onError: ErrorHandler = (
  err: Error,
  { json, var: { logger } }
) => {
  try {
    const { error } = (logger as Logger).getArea(`error`);

    error(err.message, err);

    const status =
      'status' in err ? (err.status as HTTPException['status']) : 500;

    return json({ message: err.message }, status);
  } catch (err) {
    console.error(err);
    return json({ message: defaultMessageMap.internalError }, 500);
  }
};
