import assert from 'node:assert/strict';
import test from 'node:test';
import { IssueHelpService } from './issue-help.service';
import { TrackerIssueSyncBundle } from '../../tracker/domain/tracker-sync.types';
import { IssueExplainResult, IssueExplainService } from '../../explain/application/issue-explain.service';
import { TrackerSyncService } from '../../tracker/application/tracker-sync.service';

test('issue help reuses the fetched bundle for explanation rather than loading it twice', async () => {
  const bundle = {
    issue: { id: '1', key: 'IT-1', summary: 'Test' }, comments: [], changelog: []
  } as unknown as TrackerIssueSyncBundle;
  let loads = 0;
  const trackerSyncService = {
    fetchIssueBundle: async () => { loads++; return bundle; }
  } as unknown as TrackerSyncService;
  const explain = {
    analyzeIssue: async (_key: string, providedBundle?: TrackerIssueSyncBundle) => {
      assert.equal(providedBundle, bundle);
      return { issueKey: 'IT-1', overdue: false, waitingForReply: false,
        recommendations: [], probableCauses: [], recentActivity: [] } as unknown as IssueExplainResult;
    }
  } as unknown as IssueExplainService;
  const service = new IssueHelpService({ trackerSyncService, issueExplainService: explain });
  const result = await service.handleMessage('Сделай саммари IT-1');
  assert.equal(result.issueKey, 'IT-1');
  assert.equal(loads, 1);
});
