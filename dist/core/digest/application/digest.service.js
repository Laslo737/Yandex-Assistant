"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigestService = void 0;
class DigestService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async getOnDemandDigestByLogin(login, userId) {
        const employee = await this.deps.workdayService.getMyDayByLogin(login, userId);
        let manager;
        try {
            if (await this.deps.managerSummaryService.isManagerLogin(login, true)) {
                manager = await this.deps.managerSummaryService.getSummaryByLogin(login, userId);
            }
        }
        catch {
            manager = undefined;
        }
        return {
            employee,
            manager
        };
    }
}
exports.DigestService = DigestService;
