import { AsyncLocalStorage } from 'node:async_hooks';
import { requestMetrics } from '../../core/analytics/request-metrics';
import { abortable, abortReason, TrackerLoadError } from './tracker-load';

export interface DispatcherOptions {
  concurrency: number;
  minIntervalMs: number;
  maxQueue: number;
  queueTimeoutMs: number;
  requestTimeoutMs: number;
}
interface Pending { start(): void; fail(error: unknown): void }

/** FIFO HTTP-attempt scheduler. All Tracker clients in this process share the default instance. */
export class TrackerDispatcher {
  private readonly queue: Pending[] = [];
  private active = 0;
  private nextStartAt = 0;
  private cooldownUntil = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(readonly options: DispatcherOptions) {
    for (const key of ['concurrency', 'minIntervalMs', 'maxQueue', 'queueTimeoutMs', 'requestTimeoutMs'] as const) {
      const value = options[key];
      if (!Number.isInteger(value) || value < (key === 'minIntervalMs' ? 0 : 1) || value > 3_600_000) {
        throw new Error(`Invalid Tracker dispatcher option: ${key}`);
      }
    }
  }
  pause(milliseconds: number) {
    this.cooldownUntil = Math.max(this.cooldownUntil, performance.now() + milliseconds);
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.pump();
  }
  snapshot() { return { active: this.active, queued: this.queue.length }; }

  run<T>(job: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
    if (parent?.aborted) return Promise.reject(abortReason(parent));
    if (this.queue.length >= this.options.maxQueue) return Promise.reject(new TrackerLoadError('TRACKER_QUEUE_FULL'));
    const enqueuedAt = performance.now();
    return new Promise<T>((resolve, reject) => {
      let waiting = true;
      const finishWait = () => {
        waiting = false; clearTimeout(waitTimer);
        parent?.removeEventListener('abort', onAbort);
        const metrics = requestMetrics.getStore();
        if (metrics) metrics.queueWaitMs += Math.round(performance.now() - enqueuedAt);
      };
      const pending: Pending = {
        fail: AsyncLocalStorage.bind((error: unknown) => {
          if (!waiting) return;
          const index = this.queue.indexOf(pending);
          if (index !== -1) this.queue.splice(index, 1);
          finishWait(); reject(error); this.pump();
        }),
        start: AsyncLocalStorage.bind(() => {
          finishWait(); this.active++;
          const controller = new AbortController();
          const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
          const timeout = setTimeout(() => controller.abort(new TrackerLoadError('TRACKER_REQUEST_TIMEOUT')), this.options.requestTimeoutMs);
          void abortable(signal, () => job(signal)).then(resolve, reject).finally(() => {
            clearTimeout(timeout); this.active--; this.pump();
          });
        })
      };
      const onAbort = () => pending.fail(abortReason(parent!));
      const waitTimer = setTimeout(() => pending.fail(new TrackerLoadError('TRACKER_QUEUE_TIMEOUT')), this.options.queueTimeoutMs);
      parent?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(pending); this.pump();
    });
  }

  private pump() {
    if (!this.queue.length) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      return;
    }
    if (this.timer || this.active >= this.options.concurrency) return;
    const now = performance.now();
    const delay = Math.max(this.nextStartAt, this.cooldownUntil) - now;
    if (delay > 0) {
      this.timer = setTimeout(() => { this.timer = undefined; this.pump(); }, Math.min(2147483647, Math.ceil(delay)));
      return;
    }
    const next = this.queue.shift()!;
    this.nextStartAt = now + this.options.minIntervalMs;
    next.start(); this.pump();
  }
}
