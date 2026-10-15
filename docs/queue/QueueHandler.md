# QueueHandler

`QueueHandler` is a high-level, type-safe wrapper designed for **Cloudflare Worker Queues**. It leverages [Zod](https://zod.dev/) to provide runtime validation and static type safety, ensuring that every message entering your worker conforms to a predefined schema before your business logic ever executes.

---

## Core Implementation

The following example demonstrates how to define a schema, establish context, and register handlers using the `QueueHandler` orchestration.

```typescript
import { QueueHandler, type MessageHandlers, type ContextFn } from 'hono-utils';
import { z } from 'zod';
import { DB } from './yourDb';

// 1. Define your message schema
export const QueueSchema = z.object({
  email: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    msg: z.string(),
  }),
});

type Environment = {
  db_url: string;
};
type QueueData = z.infer<typeof QueueSchema>;

type Context = {
  db: DB;
};

// 2. Define your dependency injection (Context)
export const setContext: ContextFn<Environment, Context> = (
  env,
  { eventId }
) => ({
  db: new DB(env.db_url, eventId),
});

export type Handlers = MessageHandlers<QueueData, Context>;

// 3. Implement specific logic handlers
const emailHandler: Handlers['email'] = async (content, { metadata }) => {
  console.log('📧 emailHandler invoked', { content, metadata });
  // YOUR LOGIC HERE
};

const logHandler: Handlers['log'] = async (content, { metadata, context }) => {
  console.log('📝 logHandler invoked', { content, metadata });
  await context.db.insert('logs', { level: content.level, msg: content.msg });
};

// 4. Orchestrate and Export
export const queueHandler = new QueueHandler({
  setContext,
  schema: QueueSchema,
  createEventId: () => crypto.randomUUID(),
})
  .addHandler('email', emailHandler)
  .addHandler('log', logHandler);

export const queue = queueHandler.getConsumer();

export type QueueProducer = ReturnType<typeof queueHandler.getProducer>;
```

## Usage in a Worker

```TypeScript
import { Hono } from 'hono'
import type { Queue } from '@cloudflare/workers-types';
import { queue } from 'hono-utils';
import { queueHandler, type QueueProducer } from './queue';

type Env = {
    Bindings: {
        QUEUE: Queue
    },
    Variables: {
        QUEUE: QueueProducer
    }
}

const app = new Hono<Env>()

app.use('*', queue({
    name: 'QUEUE',
    queueHandler,
}))

app.get('/email', async (c) => {
    await c.var.QUEUE('email', {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test',
    })
    return c.text('Email sent!')
})

export default app
```

## Export the Consumer

In your Worker's entry point (index.ts), export the consumer function.

```TypeScript
import { queue } from './queue';
import { app } from './app';

export default {
  queue,
  fetch: app.fetch,
};
```

---

## API Reference

### `Constructor`

Initializes the handler with validation and context rules.

| Property                | Type                | Description                                                                                                                                                              |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema`                | `ZodObject`         | The Zod schema defining all valid message keys and their payloads.                                                                                                       |
| `setContext`            | `Function`          | A factory function that generates shared resources (DB, config) for handlers.                                                                                            |
| `createEventId`         | `() => string`      | Factory that generates a unique `eventId` for each produced message (e.g. `() => crypto.randomUUID()`).                                                                  |
| `baseRetryDelaySeconds` | `number` (Optional) | Base for the exponential backoff applied to every retry (`delaySeconds = base ** attempts`). Individual handlers can override it via `addHandler`'s `retryDelaySeconds`. |

### `.addHandler(handlerName, handler, options?)`

Registers a processing function for a specific message type. This method is **chainable**.

- **`handlerName`**: A key from your `QueueSchema` (e.g., `'email'`).
- **`handler`**: An async function that receives the validated `content` and an object containing `context` and `metadata`.
- **`options.processAsBatch`** (Optional, defaults to `false`): When `true`, the handler receives **all** messages of this type within a consumer batch in a single call.
- **`options.retryDelaySeconds`** (Optional): Base for the exponential backoff applied when this handler's messages are retried. Overrides the constructor's `baseRetryDelaySeconds` for this handler.

#### Batch handlers (`processAsBatch: true`)

A batch handler is called once per consumer batch with:

1. **`messages`** — an array of items, in batch order, each carrying:
   - `content` — the Zod-validated message content
   - `context` — the per-message context resolved by `setContext`, plus that message's `ack`/`retry`
   - `metadata` — the per-message metadata (`eventId`, `parentEventId`, `language`, ...)
2. **`batch`** — batch-level info: `queue` (name), `ackAll()`, and `retryAll()`.

```ts
queueHandler.addHandler(
  'email',
  async (messages, batch) => {
    await sendBulk(messages.map((m) => m.content));
  },
  { processAsBatch: true }
);
```

**Failure semantics:**

- A message whose content fails schema validation is retried **individually** and excluded from the batch call, so a poison message cannot block the group.
- If the batch handler throws, **every message in the group is retried** (at-least-once semantics; make batch handlers idempotent).
- If every message in the group fails validation, the handler is not called.

### Exponential backoff

When a message is retried and a retry delay is configured (constructor `baseRetryDelaySeconds` or the handler's `retryDelaySeconds`), the retry is scheduled with an exponential backoff:

```
delaySeconds = min(base ** attempts, 43200)
```

- `attempts` is Cloudflare's `Message.attempts` (1 on the first delivery), so delays grow `base`, `base²`, `base³`, ...
- The result is clamped to `43200` seconds (Cloudflare's 12-hour maximum), since larger values make `retry()` throw.
- Without any configured delay, messages are retried immediately (plain `retry()`).

### `.getConsumer()`

Returns an asynchronous function compatible with the Cloudflare Worker `queue` export.

> [!IMPORTANT]
> The consumer uses `Promise.allSettled` to process batches. This means if one message fails, it will not prevent other messages in the same batch from being acknowledged or retried independently.

### `.getProducer(queue, params)`

Generates a typed producer function to push messages into a specific Cloudflare Queue. It automatically generates a unique `eventId` using the constructor's `createEventId` factory.

---

## Message Processing Lifecycle

1. **Ingestion:** Cloudflare delivers a `MessageBatch` to the worker.
2. **Grouping:** The `QueueHandler` groups the batch's messages by their `handler` key, preserving order within each group.
3. **Validation:** For each message, it uses the corresponding Zod sub-schema (e.g., `QueueSchema.shape.email`) to `.parse()` the `content`. A message that fails validation is retried individually and excluded from the group.
4. **Context Creation:** `setContext` is invoked to provide the handler with necessary dependencies.
5. **Execution:** Batch handlers receive the whole group in a single call; otherwise each message runs through its individual handler. All results are settled via `allSettled`.
6. **Settlement:** If a handler is missing, it logs a warning and acks the message. If a handler throws, the affected message(s) are retried (with backoff, when configured).
