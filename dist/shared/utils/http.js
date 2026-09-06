"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchJson = fetchJson;
exports.fetchJsonWithMeta = fetchJsonWithMeta;
async function parseJsonSafe(response) {
    const text = await response.text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return { raw: text };
    }
}
function buildError(url, response, data) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    error.data = data;
    return error;
}
function getRetryDelayMs(response, attempt) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (!Number.isNaN(seconds) && seconds >= 0) {
            return seconds * 1000;
        }
        const dateMs = new Date(retryAfter).getTime();
        if (!Number.isNaN(dateMs)) {
            return Math.max(0, dateMs - Date.now());
        }
    }
    return Math.min(1000 * 2 ** attempt, 8000);
}
function shouldRetry(response, attempt, maxRetries) {
    if (attempt >= maxRetries)
        return false;
    return response.status === 429;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    let attempt = 0;
    while (true) {
        const response = await fetch(url, options);
        if (!shouldRetry(response, attempt, maxRetries)) {
            return response;
        }
        const delayMs = getRetryDelayMs(response, attempt);
        attempt += 1;
        await sleep(delayMs);
    }
}
async function fetchJson(url, options = {}) {
    const response = await fetchWithRetry(url, options);
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw buildError(url, response, data);
    }
    return data;
}
async function fetchJsonWithMeta(url, options = {}) {
    const response = await fetchWithRetry(url, options);
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw buildError(url, response, data);
    }
    return {
        data: data,
        headers: response.headers,
        status: response.status
    };
}
