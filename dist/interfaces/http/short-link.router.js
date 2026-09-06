"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShortLinkRouter = createShortLinkRouter;
const express_1 = require("express");
const short_link_store_1 = require("../../shared/utils/short-link-store");
function createShortLinkRouter() {
    const router = (0, express_1.Router)();
    router.get('/r/:token', (req, res) => {
        const token = String(req.params.token || '').trim();
        const targetUrl = short_link_store_1.shortLinkStore.resolve(token);
        if (!targetUrl) {
            return res.status(404).send('Short link not found');
        }
        return res.redirect(302, targetUrl);
    });
    return router;
}
