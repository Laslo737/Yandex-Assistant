import { env } from '../../config/env';
import { fetchJson } from '../../shared/utils/http';
import { truncateText } from '../../shared/utils/text';

interface SendTextPayload {
  login?: string;
  chat_id?: string | number;
  thread_id?: string | number;
  payload_id: string;
  text: string;
  suggest_buttons?: unknown;
}

interface SendTypingPayload {
  login?: string;
  chat_id?: string | number;
  thread_id?: string | number;
}

export class YandexMessengerClient {
  private readonly config = env.yandexMessenger;

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      [this.config.authHeader]: `${this.config.authScheme} ${this.config.key}`
    };
  }

  async sendTyping(message: SendTypingPayload) {
    if (!this.config.key) {
      throw new Error('YANDEX_MESSENGER_KEY is not configured');
    }

    return fetchJson(`${this.config.apiBaseUrl}/bot/v1/messages/sendTyping/`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(message)
    });
  }

  async sendText(message: SendTextPayload) {
    if (!this.config.key) {
      throw new Error('YANDEX_MESSENGER_KEY is not configured');
    }

    return fetchJson(`${this.config.apiBaseUrl}/bot/v1/messages/sendText/`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        ...message,
        text: truncateText(message.text, 6000)
      })
    });
  }
}
