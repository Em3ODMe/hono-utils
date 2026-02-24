import { HTTPException } from 'hono/http-exception';
import { Logger } from 'hierarchical-area-logger';
import type { IncomingRequestCfPropertiesBotManagementBase } from '@cloudflare/workers-types';
import { createMiddleware } from 'hono/factory';
import { MiddlewareWithLoggingCapability } from './types';
import { HonoLoggerVariables } from './logger';

export type HonoIsBotVariables = {
  isBot: boolean;
};

/**
 * Middleware to detect and optionally block requests based on Cloudflare's Bot Management score.
 * @param {Object} options - Configuration options for bot detection.
 * @param {number} [options.threshold=49] - The bot score threshold (1-100).
 * Cloudflare scores below this value are treated as bots. A lower score indicates a higher
 * probability that the request is automated.
 * @param {boolean} [options.allowVerifiedBot] - If true, the middleware strictly requires
 * bots to be "verified" (e.g., Googlebot, Bingbot).
 * Note: If this is enabled, non-verified bots will be blocked regardless of their score.
 * @returns {MiddlewareHandler} A Hono middleware handler.
 * @throws {HTTPException} Throws a 401 "Bot detected" error if the score is below the
 * threshold or if a non-verified bot is detected when `allowVerifiedBot` is true.
 * @example
 * ```ts
 * const app = new Hono<{ Variables: HonoIsBotVariables }>();
 * // Block suspected bots with a score lower than 50
 * app.use('/api/*', isBot({ threshold: 50, allowVerifiedBot: true }));
 * ```
 */
export const isBot: MiddlewareWithLoggingCapability<{
  threshold: number;
  allowVerifiedBot?: boolean;
}> = (
  { threshold, allowVerifiedBot, useLogger } = {
    threshold: 49,
  }
) =>
  createMiddleware<{
    Variables: HonoIsBotVariables & HonoLoggerVariables;
  }>(async (c, next) => {
    const logger = useLogger
      ? (
          c.get('logger') ??
          new Logger({
            details: {
              service: 'dummy',
            },
          })
        ).getArea('middeware:isBot')
      : undefined;

    logger?.debug('Retrieving bot management data from cloudflare data');
    const botManagement = c.req.raw.cf?.botManagement as
      | IncomingRequestCfPropertiesBotManagementBase
      | undefined;

    if (!botManagement) {
      throw new Error('botManagement is not available');
    }

    const score = botManagement?.score ?? 54;
    const verifiedBot = botManagement?.verifiedBot ?? false;

    // Determine if this request should be treated as a bot based on score,
    // allowing verified bots when configured.
    const isBotByScore = score < threshold;
    const isVerifiedAllowed = !!(allowVerifiedBot && verifiedBot);
    const isBot = isBotByScore;

    logger?.debug('Setting isBot variable in context', {
      isBotByScore,
      isVerifiedAllowed,
      isBot,
    });

    logger?.info('isBot variable set');
    c.set('isBot', isBot);

    // Block non-verified bots when score is below threshold, or when non-verified
    // bots are not allowed by configuration.
    if (isBotByScore && !isVerifiedAllowed) {
      throw new HTTPException(401, { message: 'Bot detected' });
    }

    await next();
  });
