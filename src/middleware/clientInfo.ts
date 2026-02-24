import { createMiddleware } from 'hono/factory';
import { UAParser } from 'ua-parser-js';
import type {
  Iso3166Alpha2Code,
  ContinentCode,
} from '@cloudflare/workers-types';
import { SHA } from '../crypto';
import { MiddlewareWithLoggingCapability } from './types';
import { Logger } from 'hierarchical-area-logger';
import { HonoLoggerVariables } from './logger';

type CFData = {
  isEUCountry: boolean;
  latitude: string;
  longitude: string;
  city: string;
  country: Iso3166Alpha2Code | 'T1';
  continent: ContinentCode;
  region?: string;
  regionCode?: string;
  postalCode: string;
  timezone: string;
  colo: string;
  asn?: number;
};

type UserAgentData = {
  browser: {
    name: string;
    version: string;
  };
  device: {
    model: string;
    vendor: string;
    type: UAParser.IDevice['type'] | 'desktop';
  };
  engine: {
    name: string;
    version: string;
  };
  os: {
    name: string;
    version: string;
  };
  cpu: string;
};

export type HonoClientInfoVariables = {
  client: CFData & {
    ip: string;
    userAgent: string;
    securityHash: string;
  } & UserAgentData;
};

/**
 * Hono middleware that extracts and injects comprehensive client information
 * into the request context, including geolocation data from Cloudflare and
 * parsed User-Agent details.
 * @param {Object} [config] - Optional configuration for the middleware.
 * @param {Function} [config.securityHashString] - A custom function to generate the seed string
 * used for the security hash. Receives Cloudflare and User-Agent data as input.
 * Defaults to `${city}${country}${continent}`.
 * @param {string} [config.hashSecretBinding] - The name of the environment variable
 * containing the hash secret. Defaults to 'HASH_SECRET'.
 * @returns {MiddlewareHandler} A Hono middleware handler.
 * @throws {Error} Throws an error if Cloudflare (`req.raw.cf`) data is missing.
 * @example
 * ```ts
 * const app = new Hono<{ Variables: HonoClientInfoVariables }>();
 *
 * app.use('*', clientInfo({
 *  useLogger: true // for debugging purposes
 * }));
 *
 * app.get('/me', (c) => {
 *  const client = c.get('client');
 *  return c.json({
 *    location: `${client.city}, ${client.country}`,
 *    device: client.device.type
 *  });
 * });
 * ```
 */
export const clientInfo: MiddlewareWithLoggingCapability<{
  hashSecretBinding?: string;
  securityHashString?: (
    content: CFData & UserAgentData & { ip: string }
  ) => string;
}> = (config) =>
  createMiddleware<{
    Bindings: Record<string, string>;
    Variables: HonoClientInfoVariables & HonoLoggerVariables;
  }>(async ({ env, req, set, get }, next) => {
    const logger = config?.useLogger
      ? (
          get('logger') ??
          new Logger({
            details: {
              service: 'dummy',
            },
          })
        ).getArea('middeware:clientInfo')
      : undefined;

    if (!req.raw.cf) {
      throw new Error('Cloudflare data is not available');
    }

    logger?.debug('Retrieving hash secret from environment');
    const hashSecret = env[config?.hashSecretBinding ?? 'HASH_SECRET'] as
      | string
      | undefined;

    if (!hashSecret) {
      throw new Error('Hash secret is not available');
    }

    const {
      latitude,
      longitude,
      city,
      country,
      continent,
      colo,
      asn,
      isEUCountry,
      region,
      regionCode,
      postalCode,
      timezone,
    } = req.raw.cf as CFData;

    logger?.debug('Forming cloudflare client data object');
    const cf = {
      latitude,
      longitude,
      city,
      country,
      continent,
      colo,
      asn,
      isEUCountry: Boolean(isEUCountry),
      region,
      regionCode,
      postalCode,
      timezone,
    };

    logger?.debug('Parsing user agent');
    const userAgent = req.raw.headers.get('user-agent') ?? 'Unknown';
    const parser = new UAParser(userAgent);
    const userAgentParsed = parser.getResult();

    const { browser, device, engine, os, cpu } = userAgentParsed;

    const ua = {
      browser: {
        name: browser.name ?? 'Unknown',
        version: browser.version ?? 'Unknown',
      },
      device: {
        model: device.model ?? 'Unknown',
        vendor: device.vendor ?? 'Unknown',
        type: device.type ?? 'desktop',
      },
      engine: {
        name: engine.name ?? 'Unknown',
        version: engine.version ?? 'Unknown',
      },
      os: {
        name: os.name ?? 'Unknown',
        version: os.version ?? 'Unknown',
      },
      cpu: cpu.architecture ?? 'Unknown',
    };

    logger?.debug('Getting ip address');
    const ip =
      (req.raw.headers.get('CF-Connecting-IP') as string) ?? '127.0.0.1';

    const clientContent = { ...cf, ...ua, ip };

    logger?.debug('Setting client data into context');
    set('client', {
      ...clientContent,
      userAgent,
      securityHash: await SHA.hash({
        input:
          config?.securityHashString?.(clientContent) ??
          `${ip}${city}${country}${userAgent}`,
        algorithm: 'SHA-512',
        pepper: hashSecret,
      }),
    });
    logger?.info('Client data variable set');
    await next();
  });
