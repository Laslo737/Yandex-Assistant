"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateTrackerText = truncateTrackerText;
exports.extractTrackerAuthoredText = extractTrackerAuthoredText;
exports.normalizeTrackerCommentText = normalizeTrackerCommentText;
function truncateTrackerText(value, maxLength) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
function extractTrackerAuthoredText(value) {
    if (!value)
        return undefined;
    const cleanedLines = value
        .replace(/\r/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/:file\[[^\]]*\]\([^)]*\)\{[^}]*\}/gi, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line)
        .filter((line) => !/^>/.test(line))
        .filter((line) => !/^\{\%\s*cut/i.test(line))
        .filter((line) => !/^\{\%\s*endcut/i.test(line))
        .filter((line) => !/^предыдущие сообщения$/i.test(line))
        .filter((line) => !/^в ответ на$/i.test(line))
        .filter((line) => !/^ответ на$/i.test(line))
        .map((line) => line.replace(/\[В ответ на\]\([^)]*\)\{[^}]*\}/gi, ' '))
        .map((line) => line.replace(/https?:\/\/\S+/gi, ' '))
        .map((line) => line.replace(/\\\./g, '.'))
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line && line !== '[' && line !== ']');
    if (!cleanedLines.length)
        return undefined;
    const text = cleanedLines.join('\n').trim();
    return text || undefined;
}
function normalizeTrackerCommentText(value, maxLength = 500) {
    const authored = extractTrackerAuthoredText(value);
    if (!authored)
        return undefined;
    return truncateTrackerText(authored.replace(/\s+/g, ' ').trim(), maxLength);
}
