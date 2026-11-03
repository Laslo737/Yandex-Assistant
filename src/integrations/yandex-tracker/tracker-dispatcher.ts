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
interface Pending { background: boolean; start(): void; fail(error: unknown): void }

export const trackerBackground = new AsyncLocalStorage<boolean>();

/** Interactive-first HTTP-attempt scheduler. All Tracker clients in this process share the default instance. */
export class TrackerDispatcher {
  private readonly queue: Pending[] = [];
  private active = 0;
  private backgroundActive = 0;
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
    const background = trackerBackground.getStore() === true;
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
        background,
        fail: AsyncLocalStorage.bind((error: unknown) => {
          if (!waiting) return;
          const index = this.queue.indexOf(pending);
          if (index !== -1) this.queue.splice(index, 1);
          finishWait(); reject(error); this.pump();
        }),
        start: AsyncLocalStorage.bind(() => {
          finishWait(); this.active++;
          if (background) this.backgroundActive++;
          const controller = new AbortController();
          const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
          const timeout = setTimeout(() => controller.abort(new TrackerLoadError('TRACKER_REQUEST_TIMEOUT')), this.options.requestTimeoutMs);
          void abortable(signal, () => job(signal)).then(resolve, reject).finally(() => {
            clearTimeout(timeout); this.active--;
            if (background) this.backgroundActive--;
            this.pump();
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
    // Background work uses at most ONE HTTP slot; interactive requests jump ahead of it.
    // With concurrency > 1 this reserves the remaining slots for normal bot clicks.
    let index = this.queue.findIndex((pending) => !pending.background);
    if (index === -1) {
      if (this.backgroundActive >= 1) return;
      index = 0;
    }
    const [next] = this.queue.splice(index, 1);
    this.nextStartAt = now + this.options.minIntervalMs;
    next.start(); this.pump();
  }
}
