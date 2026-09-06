"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createYandexMessengerRouter = createYandexMessengerRouter;
const express_1 = require("express");
const yandex_messenger_incoming_1 = require("./yandex-messenger.incoming");
function readSecret(headers) {
    return (headers['x-webhook-secret'] || headers['x-channel-secret'] || headers['x-bot-secret']);
}
function createYandexMessengerRouter({ assistantService, dedupeStore, webhookSecret }) {
    const router = (0, express_1.Router)();
    router.post('/api/interfaces/yandex-messenger/webhook', (req, res) => {
        if (webhookSecret) {
            const incomingSecret = readSecret(req.headers);
            if (incomingSecret !== webhookSecret) {
                return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
            }
        }
        const updates = (0, yandex_messenger_incoming_1.extractUpdates)(req.body);
        res.status(200).json({ ok: true });
        queueMicrotask(async () => {
            for (const update of updates) {
                try {
                    const event = (0, yandex_messenger_incoming_1.normalizeUpdate)(update);
                    const dedupeKey = `yandex:${event.eventId}`;
                    if (dedupeStore.has(dedupeKey))
                        continue;
                    dedupeStore.remember(dedupeKey);
                    await assistantService.handleEvent(event);
                }
                catch (error) {
                    console.error('yandex.webhook.processing_failed', error);
                }
            }
        });
    });
    return router;
}
