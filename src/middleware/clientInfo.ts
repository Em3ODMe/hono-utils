import { createMiddleware } from 'hono/factory';
import { UAParser } from 'ua-parser-js';
import type { Context } from 'hono';
import type {
  Iso3166Alpha2Code,
  ContinentCode,
} from '@cloudflare/workers-types';
import { HonoLoggerVariables } from './logger';
import { withLogger, type LoggerFunctions } from './withLogger';

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

type ClientInfoEnv = {
  Bindings: Record<string, string>;
  Variables: HonoClientInfoVariables & HonoLoggerVariables;
};

type ClientInfoConfig = {
  useLogger?: boolean;
  hashSecretBinding?: string;
  createSecurityHashString?: (
    content: CFData & UserAgentData & { ip: string },
    bindings: Record<string, unknown>
  ) => Promise<string>;
};

/**
 * Shared extraction logic. `logger` is `undefined` when logging is disabled
 * (`useLogger: false`), in which case every log call is a no-op.
 */
const extractClientInfo = async (
  c: Context<ClientInfoEnv>,
  logger: LoggerFunctions | undefined,
  config: ClientInfoConfig | undefined
): Promise<void> => {
  const { env, req, set } = c;

  if (!req.raw.cf) {
    throw new Error('Cloudflare data is not available');
  }

  logger?.debug('Retrieving hash secret from environment');
  const hashSecret = env[config?.hashSecretBinding ?? 'HASH_SECRET'] as
    string | undefined;

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
  const ip = req.raw.headers.get('CF-Connecting-IP');

  if (!ip) {
    throw new Error('Connecting IP is not available');
  }

  const clientContent = { ...cf, ...ua, ip };

  logger?.debug('Setting client data into context');
  set('client', {
    ...clientContent,
    userAgent,
    securityHash: config?.createSecurityHashString
      ? await config?.createSecurityHashString(clientContent, env)
      : 'unset',
  });
  logger?.info('Client data variable set');
};

/**
 * Hono middleware that extracts and injects comprehensive client information
 * into the request context, including geolocation data from Cloudflare and
 * parsed User-Agent details.
 * @param {Object} [config] - Optional configuration for the middleware.
 * @param {boolean} [config.useLogger] - When true, the middleware logs through
 * the request logger via `withLogger`. Requires the `logger` middleware to be
 * registered first.
 * @param {Function} [config.createSecurityHashString] - A custom function to generate the seed string
 * used for the security hash. Receives Cloudflare and User-Agent data as input.
 * When not provided, `securityHash` is set to `'unset'`.
 * @param {string} [config.hashSecretBinding] - The name of the environment variable
 * containing the hash secret. Defaults to 'HASH_SECRET'.
 * @returns {MiddlewareHandler} A Hono middleware handler.
 * @throws {Error} Throws an error if Cloudflare (`req.raw.cf`) data is missing.
 * @throws {Error} Throws an error if the `CF-Connecting-IP` header or the hash secret is unavailable.
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
export const clientInfo = (config?: ClientInfoConfig) => {
  if (config?.useLogger) {
    return withLogger<ClientInfoEnv>('clientInfo', (c, logger) =>
      extractClientInfo(c, logger, config)
    );
  }

  return createMiddleware<ClientInfoEnv>(async (c, next) => {
    await extractClientInfo(c, undefined, config);
    await next();
  });
};
