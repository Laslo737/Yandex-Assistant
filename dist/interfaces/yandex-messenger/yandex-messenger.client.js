"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YandexMessengerClient = void 0;
const env_1 = require("../../config/env");
const http_1 = require("../../shared/utils/http");
const text_1 = require("../../shared/utils/text");
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
