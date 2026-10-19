"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerDispatcher = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const request_metrics_1 = require("../../core/analytics/request-metrics");
const tracker_load_1 = require("./tracker-load");
/** FIFO HTTP-attempt scheduler. All Tracker clients in this process share the default instance. */
class TrackerDispatcher {
    options;
    queue = [];
    active = 0;
    nextStartAt = 0;
    cooldownUntil = 0;
    timer;
    constructor(options) {
        this.options = options;
        for (const key of ['concurrency', 'minIntervalMs', 'maxQueue', 'queueTimeoutMs', 'requestTimeoutMs']) {
            const value = options[key];
            if (!Number.isInteger(value) || value < (key === 'minIntervalMs' ? 0 : 1) || value > 3_600_000) {
                throw new Error(`Invalid Tracker dispatcher option: ${key}`);
            }
        }
    }
    pause(milliseconds) {
        this.cooldownUntil = Math.max(this.cooldownUntil, performance.now() + milliseconds);
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.pump();
    }
    snapshot() { return { active: this.active, queued: this.queue.length }; }
    run(job, parent) {
        if (parent?.aborted)
            return Promise.reject((0, tracker_load_1.abortReason)(parent));
        if (this.queue.length >= this.options.maxQueue)
            return Promise.reject(new tracker_load_1.TrackerLoadError('TRACKER_QUEUE_FULL'));
        const enqueuedAt = performance.now();
        return new Promise((resolve, reject) => {
            let waiting = true;
            const finishWait = () => {
                waiting = false;
                clearTimeout(waitTimer);
                parent?.removeEventListener('abort', onAbort);
                const metrics = request_metrics_1.requestMetrics.getStore();
                if (metrics)
                    metrics.queueWaitMs += Math.round(performance.now() - enqueuedAt);
            };
            const pending = {
                fail: node_async_hooks_1.AsyncLocalStorage.bind((error) => {
                    if (!waiting)
                        return;
                    const index = this.queue.indexOf(pending);
                    if (index !== -1)
                        this.queue.splice(index, 1);
                    finishWait();
                    reject(error);
                    this.pump();
                }),
                start: node_async_hooks_1.AsyncLocalStorage.bind(() => {
                    finishWait();
                    this.active++;
                    const controller = new AbortController();
                    const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
                    const timeout = setTimeout(() => controller.abort(new tracker_load_1.TrackerLoadError('TRACKER_REQUEST_TIMEOUT')), this.options.requestTimeoutMs);
                    void (0, tracker_load_1.abortable)(signal, () => job(signal)).then(resolve, reject).finally(() => {
                        clearTimeout(timeout);
                        this.active--;
                        this.pump();
                    });
                })
            };
            const onAbort = () => pending.fail((0, tracker_load_1.abortReason)(parent));
            const waitTimer = setTimeout(() => pending.fail(new tracker_load_1.TrackerLoadError('TRACKER_QUEUE_TIMEOUT')), this.options.queueTimeoutMs);
            parent?.addEventListener('abort', onAbort, { once: true });
            this.queue.push(pending);
            this.pump();
        });
    }
    pump() {
        if (!this.queue.length) {
            if (this.timer)
                clearTimeout(this.timer);
            this.timer = undefined;
            return;
        }
        if (this.timer || this.active >= this.options.concurrency)
            return;
        const now = performance.now();
        const delay = Math.max(this.nextStartAt, this.cooldownUntil) - now;
        if (delay > 0) {
            this.timer = setTimeout(() => { this.timer = undefined; this.pump(); }, Math.min(2147483647, Math.ceil(delay)));
            return;
        }
        const next = this.queue.shift();
        this.nextStartAt = now + this.options.minIntervalMs;
        next.start();
        this.pump();
    }
}
exports.TrackerDispatcher = TrackerDispatcher;
