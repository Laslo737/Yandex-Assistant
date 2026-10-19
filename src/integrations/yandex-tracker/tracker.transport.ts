import { env } from '../../config/env';
import { requestMetrics } from '../../core/analytics/request-metrics';
import { TrackerDispatcher } from './tracker-dispatcher';
import { abortReason, TrackerLoadError, TrackerHttpError, trackerExecution } from './tracker-load';

export interface TransportOptions { operationTimeoutMs: number; maxRetries: number }
export function retryDelay(headers: Headers, attempt: number, now = Date.now(), jitter = Math.random() * 200): number {
  const value = headers.get('retry-after');
  if (value !== null && value.trim()) {
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Date.parse(value) - now;
    if (Number.isFinite(delay)) return Math.max(0, delay) + jitter;
  }
  return Math.min(1000 * 2 ** attempt, 8000) + jitter;
}
export function safeToRetry(url: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true;
  return method === 'POST' && ['/v3/issues/_search', '/v3/issues/_count'].includes(new URL(url).pathname);
}

/** Single retry layer: the generic Messenger HTTP helper is deliberately not used here. */
export class TrackerTransport {
  constructor(private readonly dispatcher: TrackerDispatcher, private readonly options: TransportOptions,
    private readonly fetcher: typeof fetch = fetch) {
    if (!Number.isInteger(options.operationTimeoutMs) || options.operationTimeoutMs < 1 || options.operationTimeoutMs > 3600_000
      || !Number.isInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 10) {
      throw new Error('Invalid Tracker transport options');
    }
  }
  async json<T>(url: string, options: RequestInit = {}): Promise<T> {
    return (await this.jsonWithMeta<T>(url, options)).data;
  }
  async jsonWithMeta<T>(url: string, options: RequestInit = {}): Promise<{ data: T; headers: Headers; status: number }> {
    const controller = new AbortController();
    const signals = [controller.signal, trackerExecution.getStore(), options.signal].filter((s): s is AbortSignal => Boolean(s));
    const signal = AbortSignal.any(signals);
    const timer = setTimeout(() => controller.abort(new TrackerLoadError('TRACKER_OPERATION_TIMEOUT')), this.options.operationTimeoutMs);
    const metrics = requestMetrics.getStore();
    const retry = safeToRetry(url, (options.method || 'GET').toUpperCase());
    try {
      for (let attempt = 0; ; attempt++) {
        let startedAt: number | undefined;
        try {
          return await this.dispatcher.run(async (attemptSignal) => {
            startedAt = performance.now();
            if (metrics) metrics.trackerRequests++;
            const response = await this.fetcher(url, { ...options, signal: attemptSignal });
            if (response.status === 429) {
              if (metrics) metrics.tracker429++;
              this.dispatcher.pause(retryDelay(response.headers, attempt));
            }
            if (!response.ok) {
              await response.body?.cancel().catch(() => undefined);
              // Do not include URL, response body or headers in exceptions/logs.
              throw new TrackerHttpError(response.status);
            }
            const text = await response.text();
            const data = text ? JSON.parse(text) as T : null as T;
            return { data, headers: response.headers, status: response.status };
          }, signal);
        } catch (error) {
          if (!signal.aborted && retry && (error as { status?: number })?.status === 429 && attempt < this.options.maxRetries) continue;
          throw signal.aborted ? abortReason(signal) : error;
        } finally {
          if (metrics && startedAt !== undefined) metrics.trackerDurationMs += Math.round(performance.now() - startedAt);
        }
      }
    } catch (error) {
      if (metrics && error instanceof TrackerLoadError && /TIMEOUT$/.test(error.code)) metrics.trackerTimeouts++;
      throw error;
    } finally { clearTimeout(timer); }
  }
}

let transport: TrackerTransport | undefined;
function defaultTransport(): TrackerTransport {
  if (!transport) {
    transport = new TrackerTransport(new TrackerDispatcher(env.tracker.load), {
      operationTimeoutMs: env.tracker.load.operationTimeoutMs, maxRetries: env.tracker.load.maxRetries
    });
  }
  return transport;
}
export function fetchTrackerJson<T>(url: string, options?: RequestInit) { return defaultTransport().json<T>(url, options); }
export function fetchTrackerJsonWithMeta<T>(url: string, options?: RequestInit) { return defaultTransport().jsonWithMeta<T>(url, options); }
