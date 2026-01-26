import { describe, it, expect } from 'vitest';
import { type HonoLoggerVariables, logger } from '@/middleware/logger';
import { createMiddlewareTester } from '../utils';

type Env = {
  Variables: HonoLoggerVariables;
};

describe(logger.name, () => {
  describe('Should success', () => {
    it('should success', async () => {
      const app = createMiddlewareTester<Env>(
        undefined,
        logger({
          service: 'logger',
        })
      );
      app.get('/test', async (c) => {
        const logDump = c.var.logger.dump();

        if (!c.var.eventId) {
          throw new Error('Event ID is not set');
        }

        return c.json({
          rootMessagesCount: logDump.root.length,
          logger: !!c.var.logger,
          eventId: !!c.var.eventId,
        });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        logger: true,
        eventId: true,
        rootMessagesCount: 2,
      });
    });

    it('should success with parent event id', async () => {
      const app = createMiddlewareTester<Env>(
        undefined,
        logger(
          {
            service: 'logger',
          },
          'parent-event-id'
        )
      );
      app.get('/test', async (c) => {
        const logDump = c.var.logger.dump();

        if (!c.var.eventId) {
          throw new Error('Event ID is not set');
        }

        return c.json({
          rootMessagesCount: logDump.root.length,
          logger: !!c.var.logger,
          eventId: !!c.var.eventId,
        });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        logger: true,
        eventId: true,
        rootMessagesCount: 3,
      });
    });

    it('should success with parent event id and propper header set', async () => {
      const app = createMiddlewareTester<Env>(
        undefined,
        logger(
          {
            service: 'logger',
          },
          'parent-event-id'
        )
      );
      app.get('/test', async (c) => {
        const logDump = c.var.logger.dump();

        if (!c.var.eventId) {
          throw new Error('Event ID is not set');
        }

        return c.json({
          rootMessagesCount: logDump.root.length,
          logger: !!c.var.logger,
          eventId: !!c.var.eventId,
        });
      });

      const res = await app.request('/test', {
        headers: {
          'parent-event-id': 'parent-event-id',
        },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        logger: true,
        eventId: true,
        rootMessagesCount: 2,
      });
    });
  });
});
