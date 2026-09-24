import { ManagerSummaryService } from '../../manager/application/manager-summary.service';
import { WorkdayService } from '../../workday/application/workday.service';

export interface OnDemandDigestResult {
  employee: Awaited<ReturnType<WorkdayService['getMyDayByLogin']>>;
  manager?: Awaited<ReturnType<ManagerSummaryService['getSummaryByLogin']>>;
}

export class DigestService {
  constructor(
    private readonly deps: {
      workdayService: WorkdayService;
      managerSummaryService: ManagerSummaryService;
    }
  ) {}

  async getOnDemandDigestByLogin(login: string, userId: string, trackerLogin?: string): Promise<OnDemandDigestResult> {
    const employee = await this.deps.workdayService.getMyDayByLogin(login, userId, { assigneeLogin: trackerLogin });

    let manager: OnDemandDigestResult['manager'];
    try {
      if (await this.deps.managerSummaryService.isManagerLogin(login)) {
        manager = await this.deps.managerSummaryService.getSummaryByLogin(login, userId);
      }
    } catch {
      manager = undefined;
    }

    return {
      employee,
      manager
    };
  }
}
