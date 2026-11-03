"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigestScheduler = void 0;
const digest_calendar_1 = require("./digest-calendar");
const tracker_dispatcher_1 = require("../../integrations/yandex-tracker/tracker-dispatcher");
const tracker_load_1 = require("../../integrations/yandex-tracker/tracker-load");
const yandex_messenger_client_1 = require("../../interfaces/yandex-messenger/yandex-messenger.client");
const analytics_service_1 = require("../analytics/analytics.service");
const request_metrics_1 = require("../analytics/request-metrics");
class DigestScheduler {
    store;
    options;
    build;
    send;
    clock;
    busy = false;
    stopped = false;
    timer;
    cooldownUntil = 0;
    seededAt = 0;
    recoveredAt = 0;
    constructor(store, options, build, send, clock = Date.now) {
        this.store = store;
        this.options = options;
        this.build = build;
        this.send = send;
        this.clock = clock;
        if (!Number.isInteger(options.intervalMs) || options.intervalMs < 1000 || options.intervalMs > 300_000 ||
            !Number.isInteger(options.loadTimeoutMs) || options.loadTimeoutMs < 1000 || options.loadTimeoutMs > 120_000) {
            throw new Error('INVALID_DIGEST_SCHEDULER_SETTINGS');
        }
    }
    start() {
        if (!this.options.enabled || this.timer)
            return;
        this.stopped = false;
        this.timer = setInterval(() => { void this.tick().catch(() => console.error('digest.scheduler_failed')); }, 1000);
        this.timer.unref();
        void this.tick().catch(() => console.error('digest.scheduler_failed'));
    }
    stop() { this.stopped = true; if (this.timer)
        clearInterval(this.timer); this.timer = undefined; }
    async tick() {
        if (!this.options.enabled || this.stopped || this.busy)
            return;
        this.busy = true;
        try {
            const now = this.clock();
            if (now < this.recoveredAt || now - this.recoveredAt >= 60_000) {
                this.store.recover(now);
                this.recoveredAt = now;
            }
            const window = (0, digest_calendar_1.morningWindow)(now);
            if (!window.weekday || now < window.start || now >= window.end || now < this.cooldownUntil)
                return;
            if (now < this.seededAt || now - this.seededAt >= 60_000) {
                this.store.seed(window.date, window.start, window.end, this.options.allowlist, now);
                this.seededAt = now;
            }
            const job = this.store.claim(now, this.options.intervalMs, this.options.allowlist);
            if (job)
                await this.deliver(job);
        }
        finally {
            this.busy = false;
        }
    }
    async deliver(job) {
        let message;
        const metrics = (0, request_metrics_1.newRequestMetrics)();
        const started = performance.now();
        try {
            message = await tracker_dispatcher_1.trackerBackground.run(true, () => request_metrics_1.requestMetrics.run(metrics, () => (0, tracker_load_1.withTrackerDeadline)(Math.min(this.options.loadTimeoutMs, Math.max(1, job.expiresAt - this.clock())), () => this.build(job))));
        }
        catch (error) {
            const known = error instanceof Error && ['DIGEST_IDENTITY_NOT_CONFIRMED', 'DIGEST_STATUSES_UNAVAILABLE'].includes(error.message);
            const code = known ? error.message : (0, analytics_service_1.safeErrorCode)(error, 'DIGEST_BUILD_FAILED');
            this.retry(job, code, 60_000 * 2 ** Math.min(job.attempts - 1, 3));
            return;
        }
        finally {
            console.info('digest.build', JSON.stringify({ jobId: job.id, durationMs: Math.round(performance.now() - started),
                trackerRequests: metrics.trackerRequests, tracker429: metrics.tracker429, queueWaitMs: metrics.queueWaitMs }));
        }
        // Re-check opt-out, identity binding and end of the morning window AFTER the potentially slow build.
        if (this.stopped || this.clock() >= job.expiresAt) {
            this.store.finish(job, this.stopped ? 'pending' : 'expired', this.clock());
            return;
        }
        if (!this.store.startSending(job, this.clock()))
            return;
        try {
            const remaining = Math.min(12_000, job.expiresAt - this.clock());
            if (remaining <= 0) {
                this.store.finish(job, 'expired', this.clock());
                return;
            }
            await this.send(job, { ...message, payloadId: `daily-${job.id}` }, AbortSignal.timeout(remaining));
            this.store.finish(job, 'sent', this.clock());
            console.info('digest.delivery', JSON.stringify({ jobId: job.id, state: 'sent' }));
        }
        catch (error) {
            if (error instanceof yandex_messenger_client_1.ScheduledSendError && error.status === 429) {
                // A received 429 is a definite rejection, unlike an HTTP/network timeout after a POST.
                this.cooldownUntil = this.clock() + error.retryAfterMs;
                this.store.pauseUntil(this.cooldownUntil);
                this.retry(job, 'MESSENGER_HTTP_429', error.retryAfterMs);
            }
            else {
                const definiteRejection = error instanceof yandex_messenger_client_1.ScheduledSendError && error.status >= 400 && error.status < 500;
                const state = definiteRejection ? 'failed' : 'uncertain';
                const code = error instanceof yandex_messenger_client_1.ScheduledSendError ? `MESSENGER_HTTP_${error.status}` : 'MESSENGER_SEND_UNCERTAIN';
                this.store.finish(job, state, this.clock(), code);
                if (error instanceof yandex_messenger_client_1.ScheduledSendError && error.status === 401) {
                    this.cooldownUntil = this.clock() + 300_000;
                    this.store.pauseUntil(this.cooldownUntil);
                }
                console.warn('digest.delivery', JSON.stringify({ jobId: job.id, state, code }));
            }
        }
    }
    retry(job, code, delay) {
        const now = this.clock();
        const next = now + Math.max(1000, delay);
        const state = next >= job.expiresAt ? 'expired' : job.attempts >= 3 ? 'failed' : 'pending';
        this.store.finish(job, state, now, code, next);
        console.warn('digest.delivery', JSON.stringify({ jobId: job.id, state, code }));
    }
}
exports.DigestScheduler = DigestScheduler;
