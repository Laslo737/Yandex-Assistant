"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateText = truncateText;
function truncateText(value, max = 6000) {
    if (!value)
        return '';
    return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
