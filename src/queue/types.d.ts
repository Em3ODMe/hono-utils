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

export interface ContextFn<Env, Context> {
  (env: Env, params: GenericQueueDataParams): Context;
}
