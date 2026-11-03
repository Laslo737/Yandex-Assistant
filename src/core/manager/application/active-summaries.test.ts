import assert from 'node:assert/strict';
import test from 'node:test';
import { ManagerSummaryService } from './manager-summary.service';
import { ProcessAnalysisService } from '../../process-analysis/application/process-analysis.service';
import { HealthService } from '../../health/application/health.service';
import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';
import { IssueAuthorizationService } from '../../authorization/application/issue-authorization.service';
import { formatManagerSummary } from '../../assistant/presentation/manager.formatters';
import { formatHealthCheck } from '../../assistant/presentation/health.formatters';
import { env } from '../../../config/env';

env.app.publicBaseUrl = 'https://assistant.example.test';
env.app.shortLinksDatabasePath = ':memory:';
env.tracker.webBaseUrl = 'https://tracker.example.test';

function setup() {
  let acl = 0;
  const tracker = {
    getUser: async () => ({ id: '123', login: 'lead' }),
    getQueues: async () => [{ id: 'IT', key: 'IT', lead: { id: '123' } }],
    getStatuses: async () => [{ id: 'done', name: 'Done', type: 'done' }, { id: 'cancelled', name: 'Cancelled', type: 'cancelled' }],
    searchIssues: async (payload: { query: string; queue?: unknown; filter?: unknown }) => {
      assert.equal(payload.queue, undefined); assert.equal(payload.filter, undefined);
      assert.equal(payload.query, 'Queue: IT Status: !"Done" Status: !"Cancelled"');
      return { issues: [
        { id: '1', key: 'IT-1', queue: { id: 'IT', key: 'IT' }, statusType: { id: 'open' }, deadline: '2000-01-01', updatedAt: new Date().toISOString() },
        { id: '2', key: 'IT-2', queue: { id: 'IT', key: 'IT' }, statusType: { id: 'open' }, updatedAt: new Date().toISOString() },
        { id: '3', key: 'IT-3', queue: { id: 'IT', key: 'IT' }, statusType: { id: 'done' } },
        { id: '4', key: 'IT-4', queue: { id: 'IT', key: 'IT' }, statusType: { id: 'cancelled' } }
      ], pagination: { totalPages: 1 } };
    }
  } as unknown as TrackerApiClient;
  const authorization = { filterReadableSearchIssues: async (_id: string, issues: Array<{ key: string }>) => {
    acl++; assert.deepEqual(issues.map((issue) => issue.key), ['IT-1', 'IT-2']); return issues;
  } } as unknown as IssueAuthorizationService;
  const manager = new ManagerSummaryService(tracker, authorization);
  const process = new ProcessAnalysisService({ trackerClient: tracker, managerSummaryService: manager, authorization });
  return { manager, process, health: new HealthService({ managerSummaryService: manager, processAnalysisService: process }), acl: () => acl };
}

test('My team counts/scores only active tasks; no archive metric or links in its response', async () => {
  const { manager, acl } = setup();
  const summary = await manager.getSummaryByLogin('lead', '123');
  assert.equal(summary.activeIssues, 2); assert.equal(summary.totalIssues, 2);
  assert.equal(summary.queueStats[0].total, 2); assert.equal(summary.overdueCount, 1);
  assert.equal(acl(), 1);
  const text = formatManagerSummary(summary);
  assert.doesNotMatch(text, /Всего задач|IT-3|IT-4/);
  assert.match(text, /Активных: 2/);
});

test('Risks and manager briefing use active-only queue loading before ACL, not archived totals', async () => {
  const { process, health } = setup();
  const risks = await process.getProcessAnalysisByLogin('lead', '123');
  assert.equal(risks.activeIssues, 2); assert.equal(risks.overdueCount, 1);
  assert.ok(risks.topTasks.every((task) => !['IT-3', 'IT-4'].includes(task.key)));
  const briefing = await health.getHealthByLogin('lead', '123');
  assert.equal(briefing.activeIssues, 2);
  assert.doesNotMatch(formatHealthCheck(briefing), /все задачи|IT-3|IT-4/);
});
