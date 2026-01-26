import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  type HonoI18nVariables,
  type HonoLanguageVariables,
  i18n,
} from '@/middleware/i18n';
import { createMiddlewareTester } from '../utils';

const translations = {
  en: {
    hello: 'hello',
    town: {
      name: 'town',
    },
    world: 'Hello {{name}}',
  },
  fr: {
    hello: 'bonjour',
    town: {
      name: 'ville',
    },
    world: 'Hello {{name}}',
  },
} as const;

const { middleware, queue } = i18n(translations, 'en');

type Env = {
  Variables: HonoI18nVariables & HonoLanguageVariables;
};

describe(i18n.name, () => {
  describe('Should fail', () => {
    it('should fail with missing language', async () => {
      const app = createMiddlewareTester<Env>({}, middleware);
      app.get('/test', async (c) => {
        return c.text(c.var.t('hello'));
      });

      const res = await app.request('/test');

      expect(res.status).toBe(500);
    });
  });

  describe('Should success', () => {
    let app: Hono<Env>;

    beforeEach(() => {
      app = createMiddlewareTester<Env>({
        language: 'en',
      });
    });
    it('should success', async () => {
      app.get('/test', middleware, async (c) => {
        return c.text(c.var.t('hello'));
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello');
    });
    it('should success with override language', async () => {
      app.get('/test', middleware, async (c) => {
        return c.text(c.var.t('hello', undefined, 'fr'));
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('bonjour');
    });
  });

  describe('should success with queue', () => {
    it('should success', async () => {
      const translation = queue('en');

      expect(translation('hello')).toBe('hello');
    });
    it('should success', async () => {
      const translation = queue('fr');

      expect(translation('hello')).toBe('bonjour');
    });
    it('should success with nested key', async () => {
      const translation = queue('en');

      expect(translation('town.name')).toBe('town');
    });
    it('should success with nested key', async () => {
      const translation = queue('fr');

      expect(translation('town.name')).toBe('ville');
    });
    it('should success with nested key', async () => {
      const translation = queue();

      expect(translation('town.name')).toBe('town');
    });
    it('should success with nested key', async () => {
      const translation = queue();

      expect(translation('town.not-exist')).toBe('town.not-exist');
    });
    it('should success with variable', async () => {
      const translation = queue();

      expect(translation('world', { name: 'world' })).toBe('Hello world');
    });
    it('should success with variable', async () => {
      const translation = queue('de' as keyof typeof translations);

      expect(translation('world', { name: 'world' })).toBe('Hello world');
    });
    it('should success with wrong variable', async () => {
      const translation = queue();

      expect(translation('world', { wrong: 'world' })).toBe('Hello {{name}}');
    });
  });
});
