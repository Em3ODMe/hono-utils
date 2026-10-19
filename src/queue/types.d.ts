import type { Message } from '@cloudflare/workers-types';

export type DataShape = Record<string, unknown>;

export type QueueSendParams = {
  parentEventId?: string;
  language?: string;
};

export type GenericQueueDataParams = {
  eventId: string;
} & QueueSendParams;

export type GenericQueueData<Content extends DataShape> = {
  handler: keyof Content;
  content: Content[keyof Content];
} & GenericQueueDataParams;

/**
 * The minimal structural view of a Zod schema that `QueueHandler` consumes.
 *
 * Only the inferred `output` (driving the class's type inference) and the
 * runtime `shape` (driving parsing) are exposed. Keeping this shape minimal
 * means the checker never has to structurally instantiate the full ZodObject
 * machinery when `QueueHandler` is instantiated over a concrete schema.
 */
export type QueueSchema<Output extends DataShape> = {
  _zod: { output: Output };
  shape: Record<string, { parse: (data: unknown) => unknown }>;
};

export interface Variables<Context> {
  context: Context & Pick<Message, 'retry' | 'ack'>;
  metadata: Omit<GenericQueueData<DataShape>, 'content'> &
    Omit<Message, 'body' | 'retry' | 'ack'>;
}

export interface Handler<Content, Context> {
  (message: Content, context: Context): Promise<void>;
}

export type MessageHandlers<QueueData extends DataShape, Context> = {
  [Term in keyof QueueData]: Handler<QueueData[Term], Variables<Context>>;
};

/** All batch handlers of a schema, keyed by handler name. */
export type BatchHandlers<QueueData extends DataShape, Context> = {
  [Term in keyof QueueData]: BatchHandler<QueueData[Term], Context>;
};

/**
 * A single message passed to a batch handler, carrying the parsed content
 * together with its per-message context and metadata (eventId, ...).
 */
export interface BatchMessage<Content, Context> {
  content: Content;
  context: Variables<Context>['context'];
  metadata: Variables<Context>['metadata'];
}

/**
 * Batch-level information passed to a batch handler: the queue name and the
 * batch-wide ack/retry controls.
 */
export interface BatchInfo {
  queue: string;
  ackAll: () => void;
  retryAll: () => void;
}

/**
 * A handler registered with `{ processAsBatch: true }`: all messages of its
 * handler name within a consumer batch are passed in a single call.
 */
export interface BatchHandler<Content, Context> {
  (messages: BatchMessage<Content, Context>[], batch: BatchInfo): Promise<void>;
}

export interface ContextFn<Environment, Context> {
  (
    env: Environment,
    params: GenericQueueDataParams
  ): Context | Promise<Context>;
}
