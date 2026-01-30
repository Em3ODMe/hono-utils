# ClientInfo Middleware

The `clientInfo` middleware for [Hono](https://hono.dev/) is a robust utility designed to run on **Cloudflare Workers**. It aggregates geolocation data from Cloudflare's edge, parses complex User-Agent strings, and generates a unique security hash for session integrity or bot detection.

---

## Features

- **Geolocation Extraction:** Automatically retrieves city, country, coordinates, and timezone from `req.raw.cf`.
- **User-Agent Parsing:** Utilizes `ua-parser-js` to break down the browser, OS, device type, and CPU architecture.
- **Security Hashing:** Generates a SHA-512 "fingerprint" of the client using a combination of IP, location, and a secret pepper.
- **Hono Integration:** Injects all data into the Hono context (`c.get('client')`) with full TypeScript support.

---

## Usage

### 1. Define Types

To ensure type safety across your application, include `HonoClientInfoVariables` in your Hono instance definition.

```typescript
import { Hono } from 'hono';
import {
  clientInfo,
  type HonoClientInfoVariables,
} from './middleware/clientInfo';

type Bindings = {
  HASH_SECRET: string; // Required for security hash
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
    fingerprint: client.securityHash,
  });
});
```

---

## Configuration

The `clientInfo` function accepts an optional configuration object:

| Option               | Type       | Default                  | Description                                                   |
| -------------------- | ---------- | ------------------------ | ------------------------------------------------------------- |
| `hashSecretBinding`  | `string`   | `'HASH_SECRET'`          | The key in your `env` that holds the secret pepper.           |
| `securityHashString` | `Function` | IP + City + Country + UA | A custom callback to define which fields are hashed together. |

### Custom Security Hash Example

```typescript
app.use(
  clientInfo({
    securityHashString: (data) => `${data.ip}-${data.asn}-${data.device.model}`,
    hashSecretBinding: 'MY_APP_PEPPER',
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
- **`securityHash`:** A SHA-512 hex string used to verify if client attributes have changed during a session.

---

## Technical Considerations

> [!IMPORTANT]
> **Cloudflare Environment:** This middleware relies on the `req.raw.cf` object, which is only populated when running on the Cloudflare Workers runtime. It will throw an error if used in Node.js or Bun environments without a Cloudflare proxy.

> [!TIP]
> **Security Hash Stability:** The default hash includes the `ip`. If your users frequently switch between Wi-Fi and Cellular data, the `securityHash` will change. For more stable "sticky" sessions, override `securityHashString` to exclude the IP.
