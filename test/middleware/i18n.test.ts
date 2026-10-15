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
    onlyEn: 'only-en',
    partial: {
      missing: 'fallback-en',
    },
    special: 'Value {{a.b}}',
    overmatch: '{{axb}}',
  },
  fr: {
    hello: 'bonjour',
    town: {
      name: 'ville',
    },
    world: 'Hello {{name}}',
    partial: {},
  },
} as const;

const { middleware, queue } = i18n(translations, 'en');

type Env = {
  Variables: HonoI18nVariables<typeof translations> & HonoLanguageVariables;
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
    it('should interpolate params in middleware mode', async () => {
      app.get('/test', middleware, async (c) => {
        return c.text(c.var.t('world', { name: 'User' }));
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello User');
    });
    it('should fall back to the default language for a nested key', async () => {
      app.get('/test', middleware, async (c) => {
        return c.text(c.var.t('partial.missing'));
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('fallback-en');
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

      // @ts-expect-error - intentionally missing key to exercise runtime fallback
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
    it('should fall back to the default language when the active language misses the leaf', async () => {
      const translation = queue('fr');

      expect(translation('partial.missing')).toBe('fallback-en');
    });
    it('should fall back to the default language when the active language misses the whole path', async () => {
      const translation = queue('fr');

      expect(translation('onlyEn')).toBe('only-en');
    });
    it('should return the raw input when the key is missing in both languages', async () => {
      const translation = queue('fr');

      // @ts-expect-error - intentionally missing key to exercise runtime fallback
      expect(translation('town.not-exist')).toBe('town.not-exist');
    });
    it('should interpolate a param key containing regex metacharacters', async () => {
      const translation = queue();

      expect(translation('special', { 'a.b': 'world' })).toBe('Value world');
    });
    it('should not over-match placeholders when a param key contains metacharacters', async () => {
      const translation = queue();

      expect(translation('overmatch', { 'a.b': 'world' })).toBe('{{axb}}');
    });
  });
});
