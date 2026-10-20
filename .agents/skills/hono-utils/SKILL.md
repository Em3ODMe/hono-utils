---
name: hono-utils
description: Use when building Hono applications with hono-utils, or when contributing to the hono-utils repository. Covers middleware (clientInfo, i18n, isBot, jsonValidator, queryValidator, logger, queue, response, withLogger), QueueHandler, router handlers (onError, onNotFound), crypto (HMAC, PBKDF2, SHA), utils (formatZodError, getSecretValue), and the typed RPC client (createTypedClient). TRIGGER when code imports from 'hono-utils', 'hono-utils/crypto', or 'hono-utils/client'.
---

# hono-utils Skill

Build and maintain applications with `hono-utils` — a TypeScript utility
library for [Hono](https://hono.dev) (MIT), Cloudflare Workers first, Node
`>=18`.

## How to use this skill

1. Read [`reference.md`](reference.md) in this directory — it is the
   **consolidated knowledge base** for the full public API. Every module,
   option, example, and runtime caveat is documented there. It is the single
   source of truth; there are no per-module docs pages.
2. Find the module in the index below, then read its section in
   `reference.md` for options and full examples.

## Module index

| Area       | Module              | Import              | Reference section                                                  |
| ---------- | ------------------- | ------------------- | ------------------------------------------------------------------ |
| Client     | `createTypedClient` | `hono-utils/client` | [`reference.md#createtypedclient`](reference.md#createtypedclient) |
| Crypto     | `HMAC`              | `hono-utils/crypto` | [`reference.md#hmac`](reference.md#hmac)                           |
| Crypto     | `PBKDF2`            | `hono-utils/crypto` | [`reference.md#pbkdf2`](reference.md#pbkdf2)                       |
| Crypto     | `SHA`               | `hono-utils/crypto` | [`reference.md#sha`](reference.md#sha)                             |
| Middleware | `clientInfo`        | `hono-utils`        | [`reference.md#clientinfo`](reference.md#clientinfo)               |
| Middleware | `i18n`              | `hono-utils`        | [`reference.md#i18n`](reference.md#i18n)                           |
| Middleware | `isBot`             | `hono-utils`        | [`reference.md#isbot`](reference.md#isbot)                         |
| Middleware | `jsonValidator`     | `hono-utils`        | [`reference.md#jsonvalidator`](reference.md#jsonvalidator)         |
| Middleware | `queryValidator`    | `hono-utils`        | [`reference.md#queryvalidator`](reference.md#queryvalidator)       |
| Middleware | `logger`            | `hono-utils`        | [`reference.md#logger`](reference.md#logger)                       |
| Middleware | `queue`             | `hono-utils`        | [`reference.md#queue-middleware`](reference.md#queue-middleware)   |
| Middleware | `response`          | `hono-utils`        | [`reference.md#response`](reference.md#response)                   |
| Middleware | `withLogger`        | `hono-utils`        | [`reference.md#withlogger`](reference.md#withlogger)               |
| Queue      | `QueueHandler`      | `hono-utils`        | [`reference.md#queuehandler`](reference.md#queuehandler)           |
| Router     | `onError`           | `hono-utils`        | [`reference.md#onerror`](reference.md#onerror)                     |
| Router     | `onNotFound`        | `hono-utils`        | [`reference.md#onnotfound`](reference.md#onnotfound)               |
| Utils      | `formatZodError`    | `hono-utils`        | [`reference.md#formatzoderror`](reference.md#formatzoderror)       |
| Utils      | `getSecretValue`    | `hono-utils`        | [`reference.md#getsecretvalue`](reference.md#getsecretvalue)       |

## Rules that come up repeatedly

- **Runtime**: Cloudflare Workers first. Library code uses Web Standard APIs
  (`Request`/`Response`, `crypto.subtle`, ...). Do not introduce Node-only
  APIs into consumer code that must run on Workers.
- **Middleware order matters** (see `reference.md` [Cross-cutting
  notes](reference.md#cross-cutting-notes)):
  - `logger` before `withLogger`, and before `clientInfo` / `isBot` / `queue`
    when they log (`useLogger: true`) or read `c.var.logger`.
  - `i18n` needs a `language` variable set by earlier middleware.
- **Cloudflare-only**: `clientInfo` and `isBot` read `req.raw.cf` and throw
  outside the Workers runtime.
- **Crypto**: passwords → `PBKDF2` (never `SHA.hash`); webhook signatures →
  `HMAC.sha256Hex` + `HMAC.timingSafeEqualHex` (never `===`); salts via
  `SHA.generateSalt()`.
- **RPC**: chain routes on the server (`const route = app.get(...).post(...)`,
  `export type AppType = typeof route`) so `createTypedClient` and `hc` can
  infer types.
- **Testing**: test endpoints with `app.request(...)` — no server startup
  needed.

## Working inside the hono-utils repository

When the task is editing `hono-utils` itself (not consuming it), also follow
the maintainer conventions:

- **Layout**: `src/<area>/` implementation, `test/<area>/` Vitest tests,
  and this `reference.md` as the single docs source.
- **Every new utility needs**: a `test/**/*.test.ts` file, a section in
  [`reference.md`](reference.md), and a README usage entry — all in the same
  change.
- **Entry points**: when adding/removing a submodule entry point, update
  `build.config.ts` **and** `package.json` `exports`.
- **Verify before finishing**:
  ```sh
  pnpm lint:check     # ESLint with zero warnings
  pnpm test           # Vitest suite
  pnpm build          # unbuild bundles all entries + declarations
  pnpm format:check   # Prettier check
  ```
- This skill ships with the npm package (`package.json` `files` includes
  `.agents/skills/hono-utils`), so keep `SKILL.md` and `reference.md` in sync
  with the public API.
