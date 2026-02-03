import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { onError } from '@/router/onError';
import { defaultMessageMap } from '@/router/constants';

type Variables = {
  logger: {
    getArea: () => {
      error: Mock;
    };
  };
};

type Bindings = {
  noop: unknown;
};

type Env = {
  Variables: Variables;
  Bindings: Bindings;
};

describe(onError.name, () => {
  let app: Hono<Env>;
  const mockErrorFn = vi.fn();
  const mockLogger = {
    getArea: vi.fn().mockReturnValue({
      error: mockErrorFn,
    }),
  };

  describe('when parseError is not provided', () => {
    beforeEach(() => {
      app = new Hono<Env>();

      app.onError(onError());

      vi.clearAllMocks();
    });
    it('should return the specific status code for HTTPException', async () => {
      app.get('/unauthorized', () => {
        throw new HTTPException(401, {
          message: 'Custom unauthorized message',
        });
      });

      const res = await app.request('/unauthorized');

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        message: 'Custom unauthorized message',
      });
      expect(mockErrorFn).not.toHaveBeenCalled();
    });
  });

  describe('when parseError is provided', () => {
    beforeEach(() => {
      app = new Hono<Env>();

      app.onError(
        onError<Bindings, Variables>(async (err, _env, get) => {
          const logger = get('logger');
          logger.getArea().error(err);
          return err.message;
        })
      );

      app.use('*', async (c, next) => {
        c.set('logger', mockLogger);
        await next();
      });

      vi.clearAllMocks();
    });

    it('should return internalError from constants if the logger fails', async () => {
      // Force the logger to crash to trigger the handler's catch block
      mockLogger.getArea.mockImplementationOnce(() => {
        throw new Error('Logger system crashed');
      });

      app.get('/emergency', () => {
        throw new Error('Initial error');
      });

      // Spy on console.error to keep test logs clean
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        /* empty */
      });

      const res = await app.request('/emergency');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: defaultMessageMap.internalError,
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return correct error message when parseError is provided', async () => {
      app.get('/emergency', () => {
        throw new Error('Initial error');
      });

      // Spy on console.error to keep test logs clean
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        /* empty */
      });

      const res = await app.request('/emergency');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: 'Initial error',
      });
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
