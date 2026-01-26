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

## Exports Documentation

- Crypto
  - [src/crypto/pbkdf2.md](src/crypto/pbkdf2.md)
  - [src/crypto/sha.md](src/crypto/sha.md)

- Middleware
  - [src/middleware/clientInfo.md](src/middleware/clientInfo.md)
  - [src/middleware/i18n.md](src/middleware/i18n.md)
  - [src/middleware/isBot.md](src/middleware/isBot.md)
  - [src/middleware/logger.md](src/middleware/logger.md)
  - [src/middleware/queue.md](src/middleware/queue.md)
  - [src/middleware/response.md](src/middleware/response.md)
  - [src/middleware/validator.md](src/middleware/validator.md)
  - [src/middleware/withLogger.md](src/middleware/withLogger.md)

- Queue
  - [src/queue/QueueHandler.md](src/queue/QueueHandler.md)
