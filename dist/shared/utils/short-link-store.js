"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortLinkStore = void 0;
exports.buildShortRedirectUrl = buildShortRedirectUrl;
const crypto_1 = require("crypto");
const env_1 = require("../../config/env");
class ShortLinkStore {
    tokenToUrl = new Map();
    urlToToken = new Map();
    remember(url) {
        const existing = this.urlToToken.get(url);
        if (existing)
            return existing;
        let token = '';
        do {
            token = (0, crypto_1.randomBytes)(4).toString('base64url');
        } while (this.tokenToUrl.has(token));
        this.tokenToUrl.set(token, url);
        this.urlToToken.set(url, token);
        return token;
    }
    resolve(token) {
        return this.tokenToUrl.get(token);
    }
}
exports.shortLinkStore = new ShortLinkStore();
function buildShortRedirectUrl(targetUrl) {
    const baseUrl = env_1.env.app.publicBaseUrl.replace(/\/+$/, '');
    const token = exports.shortLinkStore.remember(targetUrl);
    return `${baseUrl}/r/${token}`;
}
