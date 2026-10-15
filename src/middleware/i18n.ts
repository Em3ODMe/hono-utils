import { createMiddleware } from 'hono/factory';

export type HonoLanguageVariables = {
  language: string;
};

export type I18nShape = {
  [key: string]: I18nShape | string;
};

type I18nPaths<T> = T extends string
  ? never
  : {
      [K in keyof T]: K extends string
        ? T[K] extends string
          ? K
          : `${K}.${I18nPaths<T[K]>}`
        : never;
    }[keyof T];

/**
 * Dot-notated translation keys derived from a translations dictionary.
 * @example
 * ```ts
 * type Keys = I18nKey<typeof translations>; // 'greetings.polite' | 'success.user.created'
 * ```
 */
export type I18nKey<T extends I18nShape> = I18nPaths<T[keyof T]>;

export type I18nTranslate<T extends I18nShape> = (
  input: I18nKey<T>,
  params?: Record<string, string | number>,
  overrideLanguage?: keyof T
) => string;

export type HonoI18nVariables<T extends I18nShape = I18nShape> = {
  t: I18nTranslate<T>;
};

/**
 * Set i18n
 *
 * @param translations - Translations object
 * @param language - Language
 * @param defaultLanguage - Default language
 */
const setI18n =
  <T extends I18nShape>(
    translations: T,
    language: keyof T,
    defaultLanguage: string
  ) =>
  (
    input: I18nKey<T>,
    params?: Record<string, string | number>,
    overrideLanguage?: keyof T
  ): string => {
    const lookup = (
      dictionary: I18nShape | string | undefined,
      path: string[]
    ): unknown => {
      let current: unknown = dictionary;
      for (const key of path) {
        if (current && typeof current === 'object' && key in current) {
          current = (current as I18nShape)[key];
        } else {
          return undefined;
        }
      }
      return current;
    };

    const path = input.split('.');

    // Look up the whole path in the active (or override) language first,
    // then fall back to the whole path in the default language. Falling
    // back per path segment would resolve nested keys against the wrong
    // subtree of the default language.
    const result =
      lookup(translations[overrideLanguage ?? language] as I18nShape, path) ??
      lookup(translations[defaultLanguage] as I18nShape | undefined, path);

    if (params) {
      return Object.keys(params).reduce(
        (acc, key) => {
          // Escape the key before interpolating so keys containing RegExp
          // metacharacters do not over-match.
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return acc.replace(
            new RegExp(`{{${escapedKey}}}`, 'g'),
            params[key].toString()
          );
        },
        typeof result === 'string' ? result : input
      );
    }

    return typeof result === 'string' ? result : input;
  };

/**
 * I18n Middleware and Queue Factory.
 * @description
 * Sets up the `t` translation function in the Hono context.
 * Note: Requires a preceding middleware to set the `language` variable.
 * @template T - The shape of the translations object.
 * @param translations - The dictionary of translations.
 * @param defaultLanguage - The fallback language code.
 * @returns An object containing the `middleware` for Hono and a `queue` helper for background tasks.
 * @example
 * ```ts
 * const translations = { en: { hi: "Hi {{name}}" }, fr: { hi: "Salut {{name}}" } };
 * // 1. Set language first
 * app.use('*', async (c, next) => {
 * c.set('language', 'en');
 * await next();
 * });
 * // 2. Initialize i18n
 * const { middleware } = i18n(translations, 'en');
 * app.use('*', middleware);
 * // 3. Use in routes
 * app.get('/', (c) => c.text(c.var.t('hi', { name: 'User' })));
 * ```
 */
export const i18n = <T extends I18nShape>(
  translations: T,
  defaultLanguage: string
) => ({
  middleware: createMiddleware<{
    Variables: HonoLanguageVariables & HonoI18nVariables<T>;
  }>(async ({ set, var: { language } }, next) => {
    if (!language) {
      throw new Error(
        'Language variable should be initialized before translations middleware'
      );
    }
    set('t', setI18n<T>(translations, language, defaultLanguage));
    await next();
  }),
  queue: (language?: keyof T) =>
    setI18n(translations, language ?? defaultLanguage, defaultLanguage),
});
