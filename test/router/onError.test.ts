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

    it('should return 500 with the error message for plain errors', async () => {
      app.get('/boom', () => {
        throw new Error('Plain error');
      });

      const res = await app.request('/boom');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: 'Plain error',
      });
      expect(mockErrorFn).not.toHaveBeenCalled();
    });

    it('should trust a valid HTTP error status on a non-HTTPException error', async () => {
      app.get('/boom', () => {
        throw Object.assign(new Error('Rate limited'), { status: 429 });
      });

      const res = await app.request('/boom');

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({
        message: 'Rate limited',
      });
    });

    it('should return 500 when the error status is a string', async () => {
      app.get('/boom', () => {
        throw Object.assign(new Error('Weird error'), { status: '429' });
      });

      const res = await app.request('/boom');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: 'Weird error',
      });
    });

    it('should return 500 when the error status is out of the HTTP range', async () => {
      app.get('/boom', () => {
        throw Object.assign(new Error('Out of range'), { status: 600 });
      });

      const res = await app.request('/boom');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: 'Out of range',
      });
    });

    it('should return 500 when the error status is 0', async () => {
      app.get('/boom', () => {
        throw Object.assign(new Error('Aborted'), { status: 0 });
      });

      const res = await app.request('/boom');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: 'Aborted',
      });
    });
  });

  describe('when parseError is provided', () => {
    beforeEach(() => {
      app = new Hono<Env>();

      app.onError(
        onError<Env>(async (err, _env, get) => {
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

    it('should return internalError when parseError resolves undefined', async () => {
      const customApp = new Hono<Env>();

      customApp.onError(
        onError<Env>(async () => undefined as unknown as string)
      );

      customApp.get('/emergency', () => {
        throw new Error('Initial error');
      });

      const res = await customApp.request('/emergency');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: defaultMessageMap.internalError,
      });
    });
  });
});
