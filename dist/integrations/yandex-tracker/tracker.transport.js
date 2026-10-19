"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerTransport = void 0;
exports.retryDelay = retryDelay;
exports.safeToRetry = safeToRetry;
exports.fetchTrackerJson = fetchTrackerJson;
exports.fetchTrackerJsonWithMeta = fetchTrackerJsonWithMeta;
const env_1 = require("../../config/env");
const request_metrics_1 = require("../../core/analytics/request-metrics");
const tracker_dispatcher_1 = require("./tracker-dispatcher");
const tracker_load_1 = require("./tracker-load");
function retryDelay(headers, attempt, now = Date.now(), jitter = Math.random() * 200) {
    const value = headers.get('retry-after');
    if (value !== null && value.trim()) {
        const seconds = Number(value);
        const delay = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Date.parse(value) - now;
        if (Number.isFinite(delay))
            return Math.max(0, delay) + jitter;
    }
    return Math.min(1000 * 2 ** attempt, 8000) + jitter;
}
function safeToRetry(url, method) {
    if (method === 'GET' || method === 'HEAD')
        return true;
    return method === 'POST' && ['/v3/issues/_search', '/v3/issues/_count'].includes(new URL(url).pathname);
}
/** Single retry layer: the generic Messenger HTTP helper is deliberately not used here. */
class TrackerTransport {
    dispatcher;
    options;
    fetcher;
    constructor(dispatcher, options, fetcher = fetch) {
        this.dispatcher = dispatcher;
        this.options = options;
        this.fetcher = fetcher;
        if (!Number.isInteger(options.operationTimeoutMs) || options.operationTimeoutMs < 1 || options.operationTimeoutMs > 3600_000
            || !Number.isInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 10) {
            throw new Error('Invalid Tracker transport options');
        }
    }
    async json(url, options = {}) {
        return (await this.jsonWithMeta(url, options)).data;
    }
    async jsonWithMeta(url, options = {}) {
        const controller = new AbortController();
        const signals = [controller.signal, tracker_load_1.trackerExecution.getStore(), options.signal].filter((s) => Boolean(s));
        const signal = AbortSignal.any(signals);
        const timer = setTimeout(() => controller.abort(new tracker_load_1.TrackerLoadError('TRACKER_OPERATION_TIMEOUT')), this.options.operationTimeoutMs);
        const metrics = request_metrics_1.requestMetrics.getStore();
        const retry = safeToRetry(url, (options.method || 'GET').toUpperCase());
        try {
            for (let attempt = 0;; attempt++) {
                let startedAt;
                try {
                    return await this.dispatcher.run(async (attemptSignal) => {
                        startedAt = performance.now();
                        if (metrics)
                            metrics.trackerRequests++;
                        const response = await this.fetcher(url, { ...options, signal: attemptSignal });
                        if (response.status === 429) {
                            if (metrics)
                                metrics.tracker429++;
                            this.dispatcher.pause(retryDelay(response.headers, attempt));
                        }
                        if (!response.ok) {
                            await response.body?.cancel().catch(() => undefined);
                            // Do not include URL, response body or headers in exceptions/logs.
                            throw new tracker_load_1.TrackerHttpError(response.status);
                        }
                        const text = await response.text();
                        const data = text ? JSON.parse(text) : null;
                        return { data, headers: response.headers, status: response.status };
                    }, signal);
                }
                catch (error) {
                    if (!signal.aborted && retry && error?.status === 429 && attempt < this.options.maxRetries)
                        continue;
                    throw signal.aborted ? (0, tracker_load_1.abortReason)(signal) : error;
                }
                finally {
                    if (metrics && startedAt !== undefined)
                        metrics.trackerDurationMs += Math.round(performance.now() - startedAt);
                }
            }
        }
        catch (error) {
            if (metrics && error instanceof tracker_load_1.TrackerLoadError && /TIMEOUT$/.test(error.code))
                metrics.trackerTimeouts++;
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.TrackerTransport = TrackerTransport;
let transport;
function defaultTransport() {
    if (!transport) {
        transport = new TrackerTransport(new tracker_dispatcher_1.TrackerDispatcher(env_1.env.tracker.load), {
            operationTimeoutMs: env_1.env.tracker.load.operationTimeoutMs, maxRetries: env_1.env.tracker.load.maxRetries
        });
    }
    return transport;
}
function fetchTrackerJson(url, options) { return defaultTransport().json(url, options); }
function fetchTrackerJsonWithMeta(url, options) { return defaultTransport().jsonWithMeta(url, options); }
