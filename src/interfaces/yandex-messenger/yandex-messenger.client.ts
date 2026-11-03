import { env } from '../../config/env';
import { fetchJson } from '../../shared/utils/http';
import { truncateText } from '../../shared/utils/text';

export interface SendTextPayload {
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

export class ScheduledSendError extends Error {
  constructor(readonly status: number, readonly retryAfterMs = 60_000) {
    super(`MESSENGER_HTTP_${status}`); this.name = 'ScheduledSendError';
  }
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

  /** Scheduled delivery: exactly one HTTP attempt, no hidden retries of writes. */
  async sendTextOnce(message: SendTextPayload, signal: AbortSignal) {
    if (!this.config.key) throw new Error('YANDEX_MESSENGER_KEY is not configured');
    const response = await fetch(`${this.config.apiBaseUrl}/bot/v1/messages/sendText/`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(message), signal
    });
    if (!response.ok) {
      const value = response.headers.get('retry-after');
      const seconds = value === null ? NaN : Number(value);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : value ? Date.parse(value) - Date.now() : 60_000;
      await response.body?.cancel().catch(() => undefined);
      throw new ScheduledSendError(response.status, Number.isFinite(delay) ? Math.max(1000, delay) : 60_000);
    }
    // A successful HTTP response is sufficient. Invalid/empty success JSON must not trigger a resend.
    await response.body?.cancel().catch(() => undefined);
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
