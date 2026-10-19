"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestMetrics = exports.DATA_SOURCES = void 0;
exports.newRequestMetrics = newRequestMetrics;
exports.dataSource = dataSource;
const node_async_hooks_1 = require("node:async_hooks");
exports.DATA_SOURCES = {
    none: '—', fresh: 'Свежая загрузка', cache: 'Из кеша', shared: 'Общая загрузка'
};
function newRequestMetrics() {
    return { dataSource: 'none', trackerRequests: 0, tracker429: 0, trackerTimeouts: 0,
        queueWaitMs: 0, trackerDurationMs: 0, sharedWaitMs: 0 };
}
exports.requestMetrics = new node_async_hooks_1.AsyncLocalStorage();
function dataSource(source, sharedWaitMs = 0) {
    const metrics = exports.requestMetrics.getStore();
    if (metrics) {
        metrics.dataSource = source;
        metrics.sharedWaitMs += Math.round(sharedWaitMs);
    }
}
