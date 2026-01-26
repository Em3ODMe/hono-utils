import { createMiddleware } from 'hono/factory';

export type HonoLanguageVariables = {
  language: string;
};

type I18nShape = {
  [key: string]: I18nShape | string;
};

export type HonoI18nVariables = {
  t: ReturnType<typeof setI18n>;
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
    input: string,
    params?: Record<string, string | number>,
    overrideLanguage?: keyof T
  ): string => {
    const result = input.split('.').reduce(
      (acc: unknown, key: string) => {
        if (acc && typeof acc === 'object' && key in acc) {
          return (acc as I18nShape)[key];
        } else {
          if (
            translations[defaultLanguage] &&
            typeof translations[defaultLanguage] === 'object' &&
            key in translations[defaultLanguage]
          ) {
            return (translations[defaultLanguage] as I18nShape)[key];
          } else {
            return input;
          }
        }
      },
      translations[overrideLanguage ?? language]
    );

    if (params) {
      return Object.keys(params).reduce(
        (acc, key) => {
          return acc.replace(
            new RegExp(`{{${key}}}`, 'g'),
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
    Variables: HonoLanguageVariables & HonoI18nVariables;
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
