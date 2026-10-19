# ClientInfo Middleware

The `clientInfo` middleware for [Hono](https://hono.dev/) is a robust utility designed to run on **Cloudflare Workers**. It aggregates geolocation data from Cloudflare's edge, parses complex User-Agent strings, and optionally generates a security hash for session integrity or bot detection.

---

## Features

- **Geolocation Extraction:** Automatically retrieves city, country, coordinates, and timezone from `req.raw.cf`.
- **User-Agent Parsing:** Utilizes `ua-parser-js` to break down the browser, OS, device type, and CPU architecture.
- **Custom Security Hash:** Generates a `securityHash` via a user-supplied `createSecurityHashString` callback (defaults to `'unset'` when not provided).
- **Hono Integration:** Injects all data into the Hono context (`c.get('client')`) with full TypeScript support.
- **Optional Logging:** With `useLogger: true`, writes debug/info entries to the `middleware:clientInfo` area via [`withLogger`](withLogger.md).

---

## Usage

### 1. Define Types

To ensure type safety across your application, include `HonoClientInfoVariables` in your Hono instance definition.

```typescript
import { Hono } from 'hono';
import { clientInfo, type HonoClientInfoVariables } from 'hono-utils';

type Bindings = {
  HASH_SECRET: string; // Required by the middleware
};

const app = new Hono<{
  Bindings: Bindings;
  Variables: HonoClientInfoVariables;
}>();
```

### 2. Apply Middleware

Register the middleware globally or on specific routes.

```typescript
app.use('*', clientInfo());

app.get('/debug', (c) => {
  const client = c.get('client');

  return c.json({
    message: `Hello user from ${client.city}!`,
    device: client.device.type, // e.g., "mobile" or "desktop"
    isEU: client.isEUCountry,
    securityHash: client.securityHash,
  });
});
```

### 3. Logging

Pass `useLogger: true` to log through the request logger. Logs are scoped to the `middleware:clientInfo` area, and the `logger` middleware must be registered first (otherwise `withLogger` throws).

```typescript
import { logger, clientInfo } from 'hono-utils';

app.use('*', logger({ details: { instance: 'api' } }));

app.use('*', clientInfo({ useLogger: true }));
```

---

## Configuration

The `clientInfo` function accepts an optional configuration object:

| Option                     | Type                                     | Default         | Description                                                                                                                                                              |
| -------------------------- | ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useLogger`                | `boolean`                                | `undefined`     | When `true`, writes debug/info entries to the `middleware:clientInfo` area via `withLogger`. Requires the `logger` middleware to be registered first (throws otherwise). |
| `hashSecretBinding`        | `string`                                 | `'HASH_SECRET'` | The key in your `env` that holds the hash secret. The middleware throws if it is missing.                                                                                |
| `createSecurityHashString` | `(content, bindings) => Promise<string>` | `undefined`     | A custom async callback that returns the `securityHash` value. When omitted, `securityHash` is set to `'unset'`.                                                         |

### Custom Security Hash Example

```typescript
app.use(
  clientInfo({
    createSecurityHashString: async (data, bindings) => {
      const secret = bindings.HASH_SECRET;
      // Return any string you like (e.g. an HMAC/SHA digest of the fields).
      return `${data.ip}-${data.asn}-${data.device.model}`;
    },
  })
);
```

---

## Data Schema

The `client` object injected into the context contains three main categories of data:

### 1. Geolocation (`CFData`)

Extracted directly from the Cloudflare edge request.

- **Location:** `city`, `country`, `continent`, `region`, `timezone`.
- **Network:** `asn`, `colo` (Cloudflare Data Center), `ip`.
- **Coordinates:** `latitude`, `longitude`.

### 2. Device Information (`UserAgentData`)

Parsed from the `User-Agent` header.

- **Browser/Engine:** Name and version (e.g., Chrome, WebKit).
- **OS/CPU:** System name, version, and architecture (e.g., x64).
- **Device:** Vendor (Apple), Model (iPhone), and Type (mobile/desktop).

### 3. Metadata

- **`userAgent`:** The raw, unparsed User-Agent string.
- **`securityHash`:** The value returned by `createSecurityHashString`, or `'unset'` when no callback is provided. Use it to verify whether client attributes have changed during a session.

---

## Technical Considerations

> [!IMPORTANT]
> **Cloudflare Environment:** This middleware relies on the `req.raw.cf` object and the `CF-Connecting-IP` header, which are only populated when running on the Cloudflare Workers runtime. It will throw an error if either is unavailable (e.g. in Node.js or Bun without a Cloudflare proxy). It also throws if the `HASH_SECRET` binding is not present in the environment.

> [!TIP]
> **Security Hash Stability:** The security hash is fully controlled by your `createSecurityHashString` callback. If you want a stable "sticky" session identifier, avoid including volatile fields like the client IP (which changes when users switch between Wi-Fi and cellular).
