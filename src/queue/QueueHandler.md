# QueueHandler

`QueueHandler` is a high-level, type-safe wrapper designed for **Cloudflare Worker Queues**. It leverages [Zod](https://zod.dev/) to provide runtime validation and static type safety, ensuring that every message entering your worker conforms to a predefined schema before your business logic ever executes.

---

## Core Implementation

The following example demonstrates how to define a schema, establish context, and register handlers using the `QueueHandler` orchestration.

```typescript
import { QueueHandler } from 'hono-utils/queue';
import { z } from 'zod';
import { ContextFn, MessageHandlers } from './types';
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
})
  .addHandler('email', emailHandler)
  .addHandler('log', logHandler);

export const queue = queueHandler.getConsumer();
export const producer = queueHandler.getProducer();

export type QueueProducer = ReturnType<typeof queueHandler.getProducer>;
```

## Usage in a Worker

```TypeScript
import { Hono } from 'hono'
import { queue } from 'hono-utils';
import { queueHandler, type QueueProducer } from './queue';

type Env = {
    Binding: {
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
    return c.text(`Email sent!`)
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

| Property     | Type        | Description                                                                   |
| ------------ | ----------- | ----------------------------------------------------------------------------- |
| `schema`     | `ZodObject` | The Zod schema defining all valid message keys and their payloads.            |
| `setContext` | `Function`  | A factory function that generates shared resources (DB, config) for handlers. |

### `.addHandler(handlerName, handler)`

Registers a processing function for a specific message type. This method is **chainable**.

- **`handlerName`**: A key from your `QueueSchema` (e.g., `'email'`).
- **`handler`**: An async function that receives the validated `content` and an object containing `context` and `metadata`.

### `.getConsumer()`

Returns an asynchronous function compatible with the Cloudflare Worker `queue` export.

> [!IMPORTANT]
> The consumer uses `Promise.allSettled` to process batches. This means if one message fails, it will not prevent other messages in the same batch from being acknowledged or retried independently.

### `.getProducer(queue, params)`

Generates a typed producer function to push messages into a specific Cloudflare Queue. It automatically generates a unique `eventId` using `cuid2`.

---

## Message Processing Lifecycle

1. **Ingestion:** Cloudflare delivers a `MessageBatch` to the worker.
2. **Validation:** The `QueueHandler` iterates through messages. It identifies the `handler` key and uses the corresponding Zod sub-schema (e.g., `QueueSchema.shape.email`) to `.parse()` the `content`.
3. **Context Creation:** `setContext` is invoked to provide the handler with necessary dependencies.
4. **Execution:** The registered handler is executed.
5. **Settlement:** All results are settled via `allSettled`. If validation fails or a handler is missing, it logs a warning and moves to the next message.
