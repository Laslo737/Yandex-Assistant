"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthRouter = createHealthRouter;
const express_1 = require("express");
const env_1 = require("../../config/env");
function createHealthRouter({ platformStatusService }) {
    const router = (0, express_1.Router)();
    router.get('/health', (_req, res) => {
        res.json(platformStatusService.getHealthStatus());
    });
    router.get('/', (_req, res) => {
        res.json({
            ok: true,
            message: 'Yandex 360 AI Assistant Platform scaffold is running',
            service: env_1.env.app.name,
            version: env_1.env.app.version
        });
    });
    return router;
}
