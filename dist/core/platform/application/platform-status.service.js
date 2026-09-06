"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformStatusService = void 0;
const env_1 = require("../../../config/env");
class PlatformStatusService {
    trackerSyncService;
    constructor(trackerSyncService) {
        this.trackerSyncService = trackerSyncService;
    }
    getHealthStatus() {
        return {
            ok: true,
            service: env_1.env.app.name,
            version: env_1.env.app.version,
            environment: env_1.env.app.nodeEnv,
            interfaces: {
                yandexMessenger: env_1.env.yandexMessenger.enabled
            },
            integrations: {
                tracker: this.trackerSyncService.getStatus()
            }
        };
    }
}
exports.PlatformStatusService = PlatformStatusService;
