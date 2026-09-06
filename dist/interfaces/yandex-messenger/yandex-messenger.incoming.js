"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUpdate = normalizeUpdate;
exports.extractUpdates = extractUpdates;
function getEventType(update) {
    if (update.callback_data || update.callback?.data)
        return 'callback';
    if (!update.text && (update.status || update.delivery_status || update.event_type || update.type))
        return 'system';
    if (typeof update.text === 'string' && update.text.trim().startsWith('/'))
        return 'command';
    return 'message';
}
function normalizeUpdate(update) {
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
function extractUpdates(body) {
    if (Array.isArray(body?.updates)) {
        return body.updates;
    }
    if (Array.isArray(body))
        return body;
    if (body && typeof body === 'object')
        return [body];
    return [];
}
