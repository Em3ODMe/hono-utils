# hono-utils

Hono Utils - Utilities for Hono framework

A collection of helpers to simplify building Hono-based applications, including crypto helpers, middleware utilities, queue integration and RPC client.

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
import { PBKDF2, SHA, HMAC } from 'hono-utils/crypto';
```

### Client

```ts
import { createTypedClient } from 'hono-utils/client';
```

### Router

```ts
import { onError, onNotFound } from 'hono-utils';
```

### Utils

```ts
import { formatZodError, getSecretValue } from 'hono-utils';
```

## Detailed Documentation

All modules are documented in one consolidated knowledge base:
[`.agents/skills/hono-utils/reference.md`](.agents/skills/hono-utils/reference.md)

- Client
  - [createTypedClient](.agents/skills/hono-utils/reference.md#createtypedclient)

- Crypto
  - [HMAC](.agents/skills/hono-utils/reference.md#hmac)
  - [pbkdf2](.agents/skills/hono-utils/reference.md#pbkdf2)
  - [sha](.agents/skills/hono-utils/reference.md#sha)

- Middleware
  - [clientInfo](.agents/skills/hono-utils/reference.md#clientinfo)
  - [i18n](.agents/skills/hono-utils/reference.md#i18n)
  - [isBot](.agents/skills/hono-utils/reference.md#isbot)
  - [jsonValidator](.agents/skills/hono-utils/reference.md#jsonvalidator)
  - [logger](.agents/skills/hono-utils/reference.md#logger)
  - [queryValidator](.agents/skills/hono-utils/reference.md#queryvalidator)
  - [queue](.agents/skills/hono-utils/reference.md#queue-middleware)
  - [response](.agents/skills/hono-utils/reference.md#response)
  - [withLogger](.agents/skills/hono-utils/reference.md#withlogger)

- Queue
  - [QueueHandler](.agents/skills/hono-utils/reference.md#queuehandler)

- Router
  - [onError](.agents/skills/hono-utils/reference.md#onerror)
  - [onNotFound](.agents/skills/hono-utils/reference.md#onnotfound)

- Utils
  - [formatZodError](.agents/skills/hono-utils/reference.md#formatzoderror)
  - [getSecretValue](.agents/skills/hono-utils/reference.md#getsecretvalue)

## AI Agents / OpenCode Skill

`hono-utils` ships an OpenCode skill — a consolidated knowledge base for AI
agents — at `.agents/skills/hono-utils/` inside the installed package. To make
it available to agents in a consuming project, register it as a skill source:

```jsonc
// opencode.jsonc
{
  "skills": ["./node_modules/hono-utils/.agents/skills"],
}
```

The skill registers as `hono-utils`; its `reference.md` contains the full API
documentation linked above.
