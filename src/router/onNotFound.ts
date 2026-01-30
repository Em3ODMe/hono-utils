import type { NotFoundHandler } from 'hono';
import { defaultMessageMap } from './constants';

export const onNotFound: NotFoundHandler = async (c) => {
  return c.json(
    {
      message: defaultMessageMap.notFound,
    },
    404
  );
};
