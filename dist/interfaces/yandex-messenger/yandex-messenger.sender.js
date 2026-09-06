"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YandexMessengerSender = void 0;
function mapButtons(buttonRows = []) {
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
function shouldRetryWithoutButtons(error) {
    const typed = error;
    return typed?.status === 400 && typed?.data?.code === 'invalid_request';
}
class YandexMessengerSender {
    client;
    constructor(client) {
        this.client = client;
    }
    async reply(event, message) {
        const target = event.replyTarget || {};
        const typingPayload = {
            ...target,
            thread_id: event.threadId || undefined
        };
        const payload = {
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
        }
        catch (error) {
            if (payload.suggest_buttons && shouldRetryWithoutButtons(error)) {
                const fallbackPayload = { ...payload };
                delete fallbackPayload.suggest_buttons;
                return this.client.sendText(fallbackPayload);
            }
            throw error;
        }
    }
}
exports.YandexMessengerSender = YandexMessengerSender;
