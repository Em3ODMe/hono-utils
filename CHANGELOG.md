# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.3] - 2026-10-19

### Fixed

- **`QueueHandler` TypeScript instantiation blow-up on large Zod schemas.** The class was generic over the raw `ZodObject`, so every method signature re-derived `z.infer<Schema>` / `keyof z.infer<Schema>` over the concrete schema, causing pathological compile times and out-of-memory errors during `.d.ts` generation in consuming packages. `QueueHandler` is now generic over the schema's **inferred output type** instead; the raw schema instance is kept at runtime only, and the checker no longer instantiates zod's inference machinery inside the class.

### Changed

- **`QueueHandler`'s first type parameter now takes the schema's output type.** Explicit instantiation changes from `QueueHandler<typeof Schema, Environment, Context>` to `QueueHandler<z.infer<typeof Schema>, Environment, Context>`. Constructor inference (`new QueueHandler({ schema, setContext, createEventId })`) and all method signatures (`addHandler`, `getConsumer`, `getProducer`) are unchanged, and runtime behavior is identical. The `queue` middleware and `QueueFinalizationContext` follow the same output-generic convention.
- **`zod` is now a peer dependency.** Since consumers pass their own Zod schemas into `jsonValidator`/`queryValidator` and Zod errors into `formatZodError`, zod must resolve to a single shared instance; it moved from `dependencies` to `peerDependencies` (`^4.0.0`) to prevent type mismatches from duplicate copies.

## [0.7.2] - 2026-10-19

### Added

- **`withLogger` middleware wrapper** (`src/middleware/withLogger.ts`). Wraps a middleware implementation with logging capability, scoping the request logger to a `middleware:${name}` area and passing the scoped log methods (`info`/`warn`/`error`/`log`/`debug`) along with the request `eventId` and bound `dump`/`dumpFlat` helpers. Requires the `logger` middleware to be registered first (throws otherwise).
- **`logger` middleware `eventIdHeader` option.** Returns the request `eventId` to the client through a response header, defaulting to `x-event-id`.
- **`withLogger` documentation** (`docs/middleware/withLogger.md`).

### Changed

- **`isBot` and `clientInfo` logging via `withLogger`.** With `useLogger: true`, they now log through `withLogger` into the `middleware:isBot` / `middleware:clientInfo` areas and throw if the `logger` middleware has not run first (previously logging was silently skipped).
- **`response` middleware is now a direct handler.** It no longer accepts options and is registered as `response` instead of `response()`.

### Removed

- **`response` middleware `eventIdHeader` option.** Tracing headers are now set by the `logger` middleware's `eventIdHeader` option.

## [0.7.1] - 2026-10-19

### Added

- **`getSecretValue` utility** (`src/utils/getSecretValue.ts`). Resolves a secret supplied as a plain string or as a Cloudflare Secrets Store binding to its plain-string value, and is exported from `hono-utils` via the `utils` entry point.
- **Utility documentation.** Added docs for `getSecretValue` and `formatZodError` (`docs/utils/`) and a new "Utils" section in the README.

### Changed

- **`queue` middleware finalization.** The `finalizeLogHandler` option was replaced by `callOnFinalization`, a callback invoked after the request completes (post-`next()`). It receives the queue producer and `{ get, env }`, giving callers control over the final message. The middleware's `Environment` generic is now constrained to `Record<string, unknown>` and is included in `Bindings` alongside the queue bindings, and `parentEventId` is propagated to the producer whenever a logger is present.

## [0.7.0] - 2026-10-15

### Added

- **Batch message handlers** in `QueueHandler`. `addHandler` now accepts a `processAsBatch: true` option to register a handler that receives all messages of a given type within a consumer batch in a single call, along with batch-level `ackAll`/`retryAll` controls.
- **Exponential backoff for queue retries.** New `src/queue/backoff.ts` helpers (`calculateExponentialBackoff`, `calculateClampedBackoff`, `MAX_RETRY_DELAY_SECONDS`) plus per-handler `retryDelaySeconds` and constructor `baseRetryDelaySeconds` options. Failed messages are now explicitly retried instead of being silently swallowed.
- **`formatZodError` utility** (`src/utils/formatZodError.ts`), formatting Zod issues as a compact `prop: message` list, and the new `utils` entry point.
- **Queue binding auto-detection** in the `queue` middleware. The `name` option is now optional; a single Queue binding in the environment is detected automatically (an error is thrown when multiple bindings exist).
- **Async logger configuration.** The `logger` middleware now accepts static or per-request (async) resolvers for `details`, `dumpOptions`, and `createEventId`, and exposes typed bindings/variables to those resolvers.
- **`clientInfo` custom security hash.** The `securityHashString` option was replaced by an async `createSecurityHashString` that receives the Cloudflare/user-agent data and the environment bindings.
- **Custom event ID header** in the `response` middleware. It now accepts an optional `eventIdHeader` option to override the response header that carries the tracing `eventId` (defaults to `x-event-id`).

### Changed

- **`validator` renamed to `jsonValidator`.** The JSON-body validator middleware is now exported as `jsonValidator` to distinguish it from `queryValidator`.
- **`logger` middleware API.** The signature changed from `logger(details, parentEventIdHeader?)` to `logger(config)` with `details`, `parentEventIdHeader`, `createEventId`, and `dumpOptions`; it now uses `createLogger` and records the request method.
- **`clientInfo` security hash defaults to `'unset'`** when no `createSecurityHashString` is provided, and throws if the `CF-Connecting-IP` header is missing.
- **`isBot` middleware** now throws when `req.raw.cf` is missing, and its `useLogger` path no longer falls back to a "dummy" logger.
- **`response` helpers** support contentless statuses (204/205/304) with null bodies, make `success`'s `data` argument optional, and `error` now attaches a JSON body. The `websocket` helper accepts a `WebSocketPair` (Cloudflare upgrade pattern).
- **`onError`** only trusts an error's `status` when it is a valid 400–599 integer, avoiding misreporting arbitrary `status` properties as HTTP codes.
- **`queue` middleware** stores the producer under the resolved binding key and accepts a typed `QueueBindingKeys` name.
- **PBKDF2 hardening:** iteration counts are validated to `[1, 2_000_000]`, salts must be at least 16 bytes, and `verify` rejects malformed stored hashes.
- **`SHA.hash`** no longer requires the `algorithm` argument and its docs now warn against using the `pepper` construction as a MAC.
- **`i18n`** lookup now falls back per whole path (not per segment) and escapes interpolation keys for RegExp metacharacters.
- **`i18n` translation keys are now typed.** `t()` accepts a union of dot-notated keys derived from the translations object (e.g. `'auth.login' | 'welcome'`) instead of a plain `string`, enabling editor autosuggestion. `HonoI18nVariables` is now generic (`HonoI18nVariables<T>`), and `I18nShape`, `I18nKey`, and `I18nTranslate` are exported.

### Removed

- **`@paralleldrive/cuid2` dependency.** Event IDs are now generated via the configurable `createEventId` (defaulting to `crypto.randomUUID()`).
- **`MiddlewaredWithLoggingCapability` fallback loggers.** The "dummy" logger fallbacks in `clientInfo` and `isBot` were removed in favor of the real request logger.

[0.7.3]: https://github.com/Em3ODMe/hono-utils/releases/tag/0.7.3
[0.7.2]: https://github.com/Em3ODMe/hono-utils/releases/tag/0.7.2
[0.7.1]: https://github.com/Em3ODMe/hono-utils/releases/tag/0.7.1
[0.7.0]: https://github.com/Em3ODMe/hono-utils/releases/tag/0.7.0
