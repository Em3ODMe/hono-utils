import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  clientInfo,
  type HonoClientInfoVariables,
} from '@/middleware/clientInfo';
import { createMiddlewareTester } from '../utils';

type Env = {
  Variables: HonoClientInfoVariables;
};

describe(clientInfo.name, () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = createMiddlewareTester<Env>();
  });

  describe('Should fail', () => {
    it('should return 500 when Cloudflare data is missing', async () => {
      app.get('/test', clientInfo({}), async (c) => {
        return c.text('ok');
      });

      const res = await app.request('/test');

      expect(res.status).toBe(500);
    });

    it('should return 500 when the hash secret is missing', async () => {
      app.get('/test', clientInfo({}), async (c) => {
        return c.text('ok');
      });

      const res = await app.request(
        '/test',
        {},
        {
          HASH_SECRET: undefined,
        }
      );

      expect(res.status).toBe(500);
    });

    it('should return 500 when the CF-Connecting-IP header is missing', async () => {
      app.get(
        '/test',
        clientInfo({ hashSecretBinding: 'HASH_SECRET_BINDING' }),
        async (c) => {
          return c.text('ok');
        }
      );

      const req = new Request('http://localhost/test');
      Object.defineProperty(req, 'cf', {
        value: {
          cf: {},
        },
        writable: false,
      });

      const res = await app.fetch(req, {
        HASH_SECRET_BINDING: 'test',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('Should success', () => {
    it('should set full client info in the context', async () => {
      app.get(
        '/test',
        clientInfo({ hashSecretBinding: 'HASH_SECRET_BINDING' }),
        async (c) => {
          return c.json(c.var.client);
        }
      );

      const req = new Request('http://localhost/test', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
          'CF-Connecting-IP': '203.0.113.7',
        },
      });
      Object.defineProperty(req, 'cf', {
        value: {
          cf: {},
        },
        writable: false,
      });

      const res = await app.fetch(req, {
        HASH_SECRET_BINDING: 'test',
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toStrictEqual({
        browser: {
          name: 'Chrome',
          version: '58.0.3029.110',
        },
        cpu: 'amd64',
        device: {
          model: 'Unknown',
          type: 'desktop',
          vendor: 'Unknown',
        },
        engine: {
          name: 'Blink',
          version: '58.0.3029.110',
        },
        ip: '203.0.113.7',
        isEUCountry: false,
        os: {
          name: 'Windows',
          version: '10',
        },
        securityHash: 'unset',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
      });
    });
  });
});
