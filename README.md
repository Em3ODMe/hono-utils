# hono-utils

Hono Utils - Utilities for Hono framework

A collection of helpers to simplify building Hono-based applications, including crypto helpers, middleware utilities, and queue integration.

## Installation

```bash
// npm
npm install hono-utils

// pnpm
pnpm add hono-utils

// yarn
yarn add hono-utils
```

## Usage

### Middleware

```ts
import { clientInfo } from 'hono-utils';
```

### Queue

```ts
import { QueueHandler } from 'hono-utils';
```

### Crypto

```ts
import { pbkdf2, sha } from 'hono-utils';
```

### Router

```ts
import { onError, onNotFound } from 'hono-utils';
```

## Detailed Documentation

- Crypto
  - [pbkdf2](docs/crypto/pbkdf2.md)
  - [sha](docs/crypto/sha.md)

- Middleware
  - [clientInfo](docs/middleware/clientInfo.md)
  - [i18n](docs/middleware/i18n.md)
  - [isBot](docs/middleware/isBot.md)
  - [logger](docs/middleware/logger.md)
  - [queue](docs/middleware/queue.md)
  - [response](docs/middleware/response.md)
  - [validator](docs/middleware/validator.md)
  - [withLogger](docs/middleware/withLogger.md)
  - [hydrateVariable](docs/middleware/hydrateVariable.md)

- Queue
  - [QueueHandler](docs/queue/QueueHandler.md)

- Router
  - [onError](docs/router/onError.md)
  - [onNotFound](docs/router/onNotFound.md)
