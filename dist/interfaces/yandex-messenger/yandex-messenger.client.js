"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YandexMessengerClient = exports.ScheduledSendError = void 0;
const env_1 = require("../../config/env");
const http_1 = require("../../shared/utils/http");
const text_1 = require("../../shared/utils/text");
class ScheduledSendError extends Error {
    status;
    retryAfterMs;
    constructor(status, retryAfterMs = 60_000) {
        super(`MESSENGER_HTTP_${status}`);
        this.status = status;
        this.retryAfterMs = retryAfterMs;
        this.name = 'ScheduledSendError';
    }
}
exports.ScheduledSendError = ScheduledSendError;
class YandexMessengerClient {
    config = env_1.env.yandexMessenger;
    headers() {
        return {
            'Content-Type': 'application/json',
            [this.config.authHeader]: `${this.config.authScheme} ${this.config.key}`
        };
    }
    async sendTyping(message) {
        if (!this.config.key) {
            throw new Error('YANDEX_MESSENGER_KEY is not configured');
        }
        return (0, http_1.fetchJson)(`${this.config.apiBaseUrl}/bot/v1/messages/sendTyping/`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(message)
        });
    }
    /** Scheduled delivery: exactly one HTTP attempt, no hidden retries of writes. */
    async sendTextOnce(message, signal) {
        if (!this.config.key)
            throw new Error('YANDEX_MESSENGER_KEY is not configured');
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
    async sendText(message) {
        if (!this.config.key) {
            throw new Error('YANDEX_MESSENGER_KEY is not configured');
        }
        return (0, http_1.fetchJson)(`${this.config.apiBaseUrl}/bot/v1/messages/sendText/`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                ...message,
                text: (0, text_1.truncateText)(message.text, 6000)
            })
        });
    }
}
exports.YandexMessengerClient = YandexMessengerClient;
