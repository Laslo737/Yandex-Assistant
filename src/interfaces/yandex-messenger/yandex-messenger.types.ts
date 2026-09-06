export type YandexMessengerEventType =
  | "message"
  | "command"
  | "callback"
  | "system";

export interface YandexMessengerUpdate {
  update_id?: string | number;
  message_id?: string | number;
  text?: string;
  thread_id?: string | number | null;
  callback_data?: string;
  callback?: { data?: string };
  status?: string;
  delivery_status?: string;
  event_type?: string;
  type?: string;
  chat?: {
    id?: string | number;
    type?: string;
  };
  from?: {
    id?: string | number;
    login?: string;
  };
}

export interface YandexMessengerEvent {
  eventId: string;
  type: YandexMessengerEventType;
  text: string;
  threadId: string | number | null;
  chat: NonNullable<YandexMessengerUpdate["chat"]>;
  from: NonNullable<YandexMessengerUpdate["from"]>;
  replyTarget: { login?: string; chat_id?: string | number };
  metadata: {
    updateId?: string | number;
    providerMessageId?: string | number;
    chatId?: string | number;
    chatType?: string;
    providerEventType: string | null;
  };
  raw: YandexMessengerUpdate;
}

export interface YandexMessengerReplyMessage {
  text: string;
  payloadId?: string;
  buttons?: Array<Array<{ text: string }>>;
}
