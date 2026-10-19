"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
exports.safeErrorCode = safeErrorCode;
const node_async_hooks_1 = require("node:async_hooks");
const node_crypto_1 = require("node:crypto");
const request_metrics_1 = require("./request-metrics");
const tracker_load_1 = require("../../integrations/yandex-tracker/tracker-load");
const hash = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
function safeErrorCode(error, fallback) {
    if (error instanceof tracker_load_1.TrackerLoadError)
        return error.code;
    const typed = error;
    if (typeof typed?.status === 'number' && Number.isInteger(typed.status) && typed.status >= 400 && typed.status <= 599) {
        return `HTTP_${typed.status}`;
    }
    if (typed?.name === 'AbortError' || typed?.name === 'TimeoutError')
        return 'REQUEST_TIMEOUT_OR_ABORT';
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(String(typed?.code)))
        return String(typed?.code);
    return fallback;
}
/** Context is request-local; parallel handlers never share scenario/outcome state. */
class AnalyticsService {
    store;
    context = new node_async_hooks_1.AsyncLocalStorage();
    lastWarning = 0;
    constructor(store) {
        this.store = store;
    }
    safe(action) {
        try {
            action();
        }
        catch {
            if (Date.now() - this.lastWarning > 60_000) {
                console.error('analytics.storage_failed');
                this.lastWarning = Date.now();
            }
        }
    }
    scenario(scenario) { const activity = this.context.getStore(); if (activity)
        activity.scenario = scenario; }
    outcome(outcome, errorCode = '') {
        const activity = this.context.getStore();
        if (activity) {
            activity.outcome = outcome;
            activity.errorCode = errorCode;
        }
    }
    replied() {
        if (this.context.getStore()?.outcome === 'processing')
            this.outcome('replied');
    }
    async track(event, handler) {
        if (event.type === 'system')
            return handler();
        const login = (event.from?.login || '').trim().slice(0, 254);
        const subject = event.from?.id ? `id:${event.from.id}` : login ? `login:${login.toLowerCase()}` : `unknown:${event.eventId}`;
        const activity = {
            requestId: (0, node_crypto_1.randomUUID)(), eventHash: hash(JSON.stringify(['yandex', event.eventId, subject, event.chat?.id ?? ''])), userKey: hash(subject),
            login: login || 'Неизвестный отправитель', startedAt: new Date().toISOString(),
            scenario: 'other', outcome: 'processing', durationMs: 0, errorCode: '', metrics: (0, request_metrics_1.newRequestMetrics)()
        };
        let recorded = false;
        this.safe(() => { recorded = this.store.begin(activity); });
        const start = performance.now();
        return this.context.run(activity, () => request_metrics_1.requestMetrics.run(activity.metrics, async () => {
            try {
                return await handler();
            }
            catch (error) {
                if (activity.outcome !== 'delivery_error')
                    this.outcome('internal_error', safeErrorCode(error, 'UNHANDLED_ERROR'));
                throw error;
            }
            finally {
                if (activity.outcome === 'processing')
                    activity.outcome = 'no_reply';
                activity.durationMs = Math.max(0, Math.round(performance.now() - start));
                if (recorded) {
                    this.safe(() => this.store.finish(activity));
                    // Only safe structured metadata; never serialize error objects, messages or task content.
                    console.info('bot.activity', JSON.stringify({ requestId: activity.requestId, scenario: activity.scenario,
                        outcome: activity.outcome, durationMs: activity.durationMs, errorCode: activity.errorCode, ...activity.metrics }));
                }
            }
        }));
    }
}
exports.AnalyticsService = AnalyticsService;
