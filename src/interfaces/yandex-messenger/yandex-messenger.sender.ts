import { YandexMessengerClient } from './yandex-messenger.client';
import { YandexMessengerEvent, YandexMessengerReplyMessage } from './yandex-messenger.types';

function mapButtons(buttonRows: Array<Array<{ text: string }>> = []) {
  return {
    layout: true,
    persist: false,
    buttons: buttonRows
      .slice(0, 100)
      .map((row) => row.map((button) => ({
        title: button.text,
        directives: [
          {
            type: 'send_message',
            text: button.text
          }
        ]
      })))
  };
}

function shouldRetryWithoutButtons(error: unknown): boolean {
  const typed = error as { status?: number; data?: { code?: string } };
  return typed?.status === 400 && typed?.data?.code === 'invalid_request';
}

export class YandexMessengerSender {
  constructor(private readonly client: YandexMessengerClient) {}

  async reply(event: YandexMessengerEvent, message: YandexMessengerReplyMessage) {
    const target = event.replyTarget || {};
    const typingPayload: {
      login?: string;
      chat_id?: string | number;
      thread_id?: string | number;
    } = {
      ...target,
      thread_id: event.threadId || undefined
    };

    const payload: {
      login?: string;
      chat_id?: string | number;
      thread_id?: string | number;
      payload_id: string;
      text: string;
      suggest_buttons?: unknown;
    } = {
      ...target,
      thread_id: event.threadId || undefined,
      payload_id: message.payloadId || `msg-${Date.now()}`,
      text: message.text
    };

    if (event.chat?.type === 'private' && !target.login) {
      throw new Error('YANDEX_LOGIN_REQUIRED');
    }

    if (message.buttons?.length) {
      payload.suggest_buttons = mapButtons(message.buttons);
    }

    try {
      await this.client.sendTyping(typingPayload).catch(() => undefined);
      return await this.client.sendText(payload);
    } catch (error) {
      if (payload.suggest_buttons && shouldRetryWithoutButtons(error)) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.suggest_buttons;
        return this.client.sendText(fallbackPayload);
      }

      throw error;
    }
  }
}
