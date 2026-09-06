import { YandexMessengerEvent, YandexMessengerEventType, YandexMessengerUpdate } from './yandex-messenger.types';

function getEventType(update: YandexMessengerUpdate): YandexMessengerEventType {
  if (update.callback_data || update.callback?.data) return 'callback';
  if (!update.text && (update.status || update.delivery_status || update.event_type || update.type)) return 'system';
  if (typeof update.text === 'string' && update.text.trim().startsWith('/')) return 'command';
  return 'message';
}

export function normalizeUpdate(update: YandexMessengerUpdate): YandexMessengerEvent {
  return {
    eventId: String(update.update_id || update.message_id || Date.now()),
    type: getEventType(update),
    text: update.text || update.callback_data || update.callback?.data || '',
    threadId: update.thread_id || null,
    chat: update.chat || {},
    from: update.from || {},
    replyTarget: update.chat?.type === 'private'
      ? { login: update.from?.login }
      : { chat_id: update.chat?.id },
    metadata: {
      updateId: update.update_id,
      providerMessageId: update.message_id,
      chatId: update.chat?.id,
      chatType: update.chat?.type,
      providerEventType: update.event_type || update.type || null
    },
    raw: update
  };
}

export function extractUpdates(body: unknown): YandexMessengerUpdate[] {
  if (Array.isArray((body as { updates?: unknown[] })?.updates)) {
    return (body as { updates: YandexMessengerUpdate[] }).updates;
  }

  if (Array.isArray(body)) return body as YandexMessengerUpdate[];
  if (body && typeof body === 'object') return [body as YandexMessengerUpdate];
  return [];
}
