import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { onError } from '@/router/onError';
import { defaultMessageMap } from '@/router/constants';

type Env = {
  Variables: {
    logger: {
      getArea: () => {
        error: Mock;
      };
    };
  };
};

describe(onError.name, () => {
  let app: Hono<Env>;
  const mockErrorFn = vi.fn();
  const mockLogger = {
    getArea: vi.fn().mockReturnValue({
      error: mockErrorFn,
    }),
  };

  describe('when logger is set', () => {
    beforeEach(() => {
      app = new Hono<Env>();

      app.use('*', async (c, next) => {
        c.set('logger', mockLogger);
        await next();
      });

      app.onError(onError);

      vi.clearAllMocks();
    });
    it('should return 500 and the error message for standard Errors', async () => {
      app.get('/fail', () => {
        throw new Error('Standard failure');
      });

      const res = await app.request('/fail');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ message: 'Standard failure' });
      expect(mockErrorFn).toHaveBeenCalledWith(
        'Standard failure',
        expect.any(Error)
      );
    });

    it('should return 500 when a generic object with a status property is thrown', async () => {
      app.get('/forbidden', () => {
        throw new Error('Access Denied', { cause: { status: 403 } });
      });

      const res = await app.request('/forbidden');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ message: 'Access Denied' });
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
      expect(mockErrorFn).toHaveBeenCalled();
    });
  });

  describe('when logger is not set', () => {
    beforeEach(() => {
      app = new Hono<Env>();

      app.onError(onError);

      vi.clearAllMocks();
    });
    it('should return the specific status code for HTTPException', async () => {
      app.get('/unauthorized', () => {
        throw new HTTPException(401, {
          message: 'Custom unauthorized message',
        });
      });

      const res = await app.request('/unauthorized');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: defaultMessageMap.internalError,
      });
      expect(mockErrorFn).not.toHaveBeenCalled();
    });
  });

  describe('Internal Handler Failures', () => {
    beforeEach(() => {
      app = new Hono<Env>();

      app.onError(onError);

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
  });
});
