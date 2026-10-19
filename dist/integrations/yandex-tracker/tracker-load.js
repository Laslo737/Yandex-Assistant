"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackerExecution = exports.TrackerHttpError = exports.TrackerLoadError = void 0;
exports.trackerLoadMessage = trackerLoadMessage;
exports.abortReason = abortReason;
exports.abortable = abortable;
exports.withTrackerDeadline = withTrackerDeadline;
const node_async_hooks_1 = require("node:async_hooks");
class TrackerLoadError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'TrackerLoadError';
    }
}
exports.TrackerLoadError = TrackerLoadError;
class TrackerHttpError extends Error {
    status;
    constructor(status) {
        super(`Tracker API HTTP ${status}`);
        this.status = status;
        this.name = 'TrackerHttpError';
    }
}
exports.TrackerHttpError = TrackerHttpError;
function trackerLoadMessage(error) {
    if (error instanceof TrackerLoadError) {
        if (error.code === 'TRACKER_QUEUE_FULL' || error.code === 'MY_DAY_BUSY') {
            return 'Сейчас много обращений к боту. Попробуйте ещё раз через минуту.';
        }
        if (error.code === 'TRACKER_QUEUE_TIMEOUT')
            return 'Не удалось дождаться свободного места в очереди Tracker. Попробуйте чуть позже.';
        return 'Загрузка данных Tracker заняла слишком много времени. Попробуйте ещё раз чуть позже.';
    }
    if (error instanceof TrackerHttpError && error.status === 429)
        return 'Tracker временно ограничил частоту запросов. Попробуйте через минуту.';
    return undefined;
}
exports.trackerExecution = new node_async_hooks_1.AsyncLocalStorage();
function abortReason(signal) {
    return signal.reason instanceof Error ? signal.reason : new TrackerLoadError('TRACKER_OPERATION_TIMEOUT');
}
async function abortable(signal, action) {
    if (signal.aborted)
        throw abortReason(signal);
    let listener = () => { };
    const cancelled = new Promise((_resolve, reject) => {
        listener = () => reject(abortReason(signal));
        signal.addEventListener('abort', listener, { once: true });
    });
    try {
        return await Promise.race([Promise.resolve().then(() => { if (signal.aborted)
                throw abortReason(signal); return action(); }), cancelled]);
    }
    finally {
        signal.removeEventListener('abort', listener);
    }
}
async function withTrackerDeadline(milliseconds, action) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new TrackerLoadError('MY_DAY_TIMEOUT')), milliseconds);
    try {
        return await exports.trackerExecution.run(controller.signal, () => abortable(controller.signal, action));
    }
    finally {
        clearTimeout(timer);
        // Allow cancelled queue/HTTP promises to record their counters before the enclosing activity finishes.
        if (controller.signal.aborted)
            await new Promise((resolve) => setImmediate(resolve));
    }
}
