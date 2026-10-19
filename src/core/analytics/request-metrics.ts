import { AsyncLocalStorage } from 'node:async_hooks';

export type DataSource = 'none' | 'fresh' | 'cache' | 'shared';
export const DATA_SOURCES: Record<DataSource, string> = {
  none: '—', fresh: 'Свежая загрузка', cache: 'Из кеша', shared: 'Общая загрузка'
};
export interface RequestMetrics {
  dataSource: DataSource;
  trackerRequests: number;
  tracker429: number;
  trackerTimeouts: number;
  queueWaitMs: number;
  trackerDurationMs: number;
  sharedWaitMs: number;
}
export function newRequestMetrics(): RequestMetrics {
  return { dataSource: 'none', trackerRequests: 0, tracker429: 0, trackerTimeouts: 0,
    queueWaitMs: 0, trackerDurationMs: 0, sharedWaitMs: 0 };
}
export const requestMetrics = new AsyncLocalStorage<RequestMetrics>();
export function dataSource(source: DataSource, sharedWaitMs = 0) {
  const metrics = requestMetrics.getStore();
  if (metrics) { metrics.dataSource = source; metrics.sharedWaitMs += Math.round(sharedWaitMs); }
}
