import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantService } from './assistant.service';
import { AnalyticsStore } from '../../analytics/analytics.store';
import { AnalyticsService } from '../../analytics/analytics.service';
import { TrackerLoadError } from '../../../integrations/yandex-tracker/tracker-load';
import { getManagerFocusIssueKeys } from '../presentation/manager.formatters';
import { YandexMessengerEvent, YandexMessengerReplyMessage } from '../../../interfaces/yandex-messenger/yandex-messenger.types';

type Deps = ConstructorParameters<typeof AssistantService>[0];
function event(text: string, type = 'private'): YandexMessengerEvent {
  return {
    eventId: '1', type: 'message', text, threadId: null,
    chat: { id: 'chat', type }, from: { login: 'test.user' },
    replyTarget: { login: 'test.user' }, metadata: { providerEventType: null }, raw: {}
  };
}
function setup(workdayResult?: unknown, managerResult?: unknown, analytics?: AnalyticsService) {
  const replies: string[] = [];
  const messages: YandexMessengerReplyMessage[] = [];
  const calls: string[] = [];
  const deps = {
    analytics,
    sender: { reply: async (_event: unknown, message: YandexMessengerReplyMessage) => {
      replies.push(message.text);
      messages.push(message);
    } },
    authorization: {
      resolveIdentity: async () => ({ id: 'id-1', trackerLogin: 'test.user' }),
      canReadIssue: async () => { calls.push('access'); return { allowed: false, reason: 'NO_PERMISSION' }; }
    },
    managerSummaryService: {
      isManagerLogin: async () => false,
      getSummaryByLogin: async () => managerResult
    },
    changesService: {
      getMyChangesByLogin: async (_login: string, hours: number) => {
        calls.push(`my:${hours}`);
        return { scope: 'my', periodHours: hours, titleTarget: 'test.user',
          changedIssuesCount: 0, statusChangedCount: 0, commentedCount: 0, overdueCount: 0, topTasks: [] };
      },
      getTeamChangesByLogin: async (_login: string, hours: number) => {
        calls.push(`team:${hours}`);
        return { scope: 'team', periodHours: hours, titleTarget: 'TEST',
          changedIssuesCount: 0, statusChangedCount: 0, commentedCount: 0, overdueCount: 0, topTasks: [] };
      }
    },
    issueHelpService: {
      canHandleMessage: (text: string) => /IT-1/.test(text),
      handleMessage: async () => { calls.push('help'); throw new Error('must not run'); }
    },
    issueExplainService: { analyzeIssue: async () => { calls.push('analysis'); throw new Error('must not run'); } },
    trackerSyncService: { getIssueBundlePreview: async () => { calls.push('preview'); throw new Error('must not run'); } },
    workdayService: { getMyDayByLogin: async () => {
      if (workdayResult) return workdayResult;
      calls.push('day');
      throw new Error('must not run');
    } }
  } as unknown as Deps;
  return { service: new AssistantService(deps), replies, messages, calls, deps };
}

test('group chat is rejected before identity lookup or Tracker access', async () => {
  const { service, replies, messages, calls } = setup();
  await service.handleEvent(event('IT-1', 'group'));
  assert.equal(calls.length, 0);
  assert.match(replies[0], /личном чате/);
  assert.equal(messages[0].buttons, undefined);
});

test('whoami shows only the sender login in a private chat', async () => {
  const { service, replies, calls } = setup();
  await service.handleEvent(event('/whoami'));
  assert.match(replies[0], /test\.user/);
  assert.deepEqual(calls, []);
  const group = setup();
  await group.service.handleEvent(event('/whoami', 'group'));
  assert.doesNotMatch(group.replies[0], /test\.user/);
});

test('issue-help cannot read a denied issue', async () => {
  const { service, replies, messages, calls } = setup();
  await service.handleEvent(event('Почему IT-1 не двигается?'));
  assert.deepEqual(calls, ['access']);
  assert.match(replies[0], /Нет доступа/);
  assert.deepEqual(messages[0].buttons, [[{ text: '📋 Меню' }]]);
});

test('issue preview cannot read a denied issue', async () => {
  const { service, replies, messages, calls } = setup();
  await service.handleEvent(event('issue EXAMPLE-2'));
  assert.deepEqual(calls, ['access']);
  assert.match(replies[0], /Нет доступа/);
  assert.deepEqual(messages[0].buttons, [[{ text: '📋 Меню' }]]);
});

test('My day offers only three focus analyses, each on a full-width row', async () => {
  const topTasks = ['IT-1', 'IT-2', 'IT-3', 'IT-4', 'IT-5']
    .map((key) => ({ key, summary: key, overdue: false }));
  const { service, messages } = setup({ login: 'test.user', assigneeCandidates: [],
    matchedAssigneeCandidate: 'test.user', terminalStatusNames: [],
    totalAssigned: 5, activeAssigned: 5, overdueCount: 0, recentlyUpdatedCount: 0, topTasks });
  await service.handleEvent(event('Мой день'));
  const message = messages[0];
  const analysisRows = (message.buttons || []).filter((row) => row[0]?.text.startsWith('🔎 Анализ'));
  assert.deepEqual(analysisRows, ['IT-1', 'IT-2', 'IT-3'].map((key) => [{ text: `🔎 Анализ ${key}` }]));
  assert.doesNotMatch(message.text, /IT-4|IT-5/);
  assert.deepEqual(message.buttons, [...analysisRows, [{ text: '📋 Меню' }]]);
});

test('empty My day shows assigned count instead of internal login diagnostics', async () => {
  const { service, messages } = setup({ login: 'some.user@example.com',
    assigneeCandidates: ['some.user@example.com', 'some.user'],
    matchedAssigneeCandidate: 'some.user', terminalStatusNames: [], totalAssigned: 4,
    activeAssigned: 0, overdueCount: 0, recentlyUpdatedCount: 0, topTasks: [] });
  await service.handleEvent(event('Мой день'));
  assert.match(messages[0].text, /Всего назначенных задач: 4/);
  assert.doesNotMatch(messages[0].text, /Диагностика|candidates=|some\.user@example\.com/);
  assert.deepEqual(messages[0].buttons, [[{ text: '📋 Меню' }]]);
});

test('My team analysis buttons follow the three actually visible queue focus tasks', async () => {
  const task = (key: string) => ({ key, summary: key, overdue: false, stale: false });
  const summary = {
    manager: { display: 'Lead' }, queues: [{ key: 'IT' }], terminalStatusNames: [],
    totalIssues: 5, activeIssues: 5, overdueCount: 0, staleCount: 0,
    queueStats: [{ key: 'IT', total: 5, active: 5, overdue: 0, stale: 0,
      topTasks: ['IT-1', 'IT-2', 'IT-3'].map(task) }],
    topTasks: ['IT-5', 'IT-4', 'IT-3', 'IT-2', 'IT-1'].map(task)
  };
  const { service, messages } = setup(undefined, summary);
  await service.handleEvent(event('👥 Моя команда'));
  const message = messages[0];
  const analysisRows = (message.buttons || []).filter((row) => row[0]?.text.startsWith('🔎 Анализ'));
  assert.deepEqual(analysisRows, ['IT-1', 'IT-2', 'IT-3'].map((key) => [{ text: `🔎 Анализ ${key}` }]));
  assert.doesNotMatch(message.text, /IT-4|IT-5/);
  assert.equal(message.buttons?.at(-1)?.[0]?.text, '📋 Меню');
  assert.ok(!message.buttons?.flat().some((button) => /изменения/i.test(button.text)));
});

test('multi-queue analysis buttons follow the five-item overall focus', async () => {
  const task = (key: string) => ({ key, overdue: false, stale: false });
  const queue = (key: string) => ({ key, total: 5, active: 5, overdue: 0, stale: 0, topTasks: [task(`${key}-1`)] });
  const summary = { queueStats: [queue('IT'), queue('HR')],
    topTasks: ['IT-1', 'HR-1', 'IT-2', 'HR-2', 'IT-3'].map(task) };
  assert.deepEqual(getManagerFocusIssueKeys(summary as Parameters<typeof getManagerFocusIssueKeys>[0]),
    ['IT-1', 'HR-1', 'IT-2', 'HR-2', 'IT-3']);
});

test('manager briefing and queue risks do not offer Changes buttons', async () => {
  const { service, messages, deps } = setup();
  const result = {
    queues: [], terminalStatusNames: [], topTasks: [], queueHighlights: [], assigneeHighlights: [],
    score: 100, statusLabel: 'Стабильно', headline: 'Нет рисков', activeIssues: 0, overdueCount: 0,
    staleCount: 0, whatHappened: [], bottlenecks: [], todayActions: [], oldBacklogLines: [],
    risks: [], recommendations: [], keySignals: [], hygieneRiskLines: [], summaryLines: [],
    singleQueueMode: false, mainFinding: 'Нет рисков', riskLevel: 'low', riskType: 'mixed'
  };
  deps.healthService = { getHealthByLogin: async () => result } as unknown as Deps['healthService'];
  deps.processAnalysisService = { getProcessAnalysisByLogin: async () => result } as unknown as Deps['processAnalysisService'];
  for (const command of ['Сводка руководителя', 'Риски по очередям']) {
    await service.handleEvent(event(command));
    const message = messages.at(-1)!;
    assert.doesNotMatch(message.text, /Не удалось/);
    assert.ok(!message.buttons?.flat().some((button) => /изменения/i.test(button.text)));
    assert.ok(message.buttons?.flat().some((button) => button.text === '👥 Моя команда'));
  }
});

test('main menu retains Ask AI while Changes remains available only by explicit command', async () => {
  const { service, messages } = setup();
  await service.handleEvent(event('Меню'));
  assert.ok(messages[0].buttons?.flat().some((button) => button.text === '🤖 Спросить AI'));
  assert.ok(!messages[0].buttons?.flat().some((button) => /изменения/i.test(button.text)));
  assert.doesNotMatch(messages[0].text, /изменений/);
  await service.handleEvent(event('Изменения'));
  assert.match(messages[1].text, /Что изменилось/);
  await service.handleEvent(event('изменения: мои задачи'));
  assert.match(messages[2].text, /Выберите период/);
  assert.ok(messages[2].buttons?.flat().some((button) => /Мои 24ч/.test(button.text)));
});

test('changes period buttons route to the matching scope and interval, including emoji variants', async () => {
  const { service, messages, calls } = setup();
  for (const text of ['🕒 Мои 24ч', '🕒️ Мои 7д', '🕒 Команда 24ч', '🕒️ Команда 7д']) {
    await service.handleEvent(event(text));
  }
  assert.deepEqual(calls, ['my:24', 'my:168', 'team:24', 'team:168']);
  for (const message of messages) {
    assert.match(message.text, /Что изменилось/);
    assert.doesNotMatch(message.text, /Пока лучше всего/);
    assert.equal(message.buttons?.at(-1)?.[0]?.text, '📋 Меню');
  }
});

test('assistant analytics records actual denied scenario, service errors and group rejection', async () => {
  const store = new AnalyticsStore(':memory:');
  try {
    const { service } = setup(undefined, undefined, new AnalyticsService(store));
    await service.handleEvent({ ...event('issue EXAMPLE-2'), eventId: 'denied' });
    await service.handleEvent({ ...event('Мой день'), eventId: 'failed' });
    await service.handleEvent({ ...event('меню', 'group'), eventId: 'group' });
    const rows = store.activities({ since: '2000-01-01' }).rows;
    assert.equal(rows.find((r) => r.scenario === 'preview')?.outcome, 'access_denied');
    assert.equal(rows.find((r) => r.scenario === 'my_day')?.outcome, 'service_error');
    assert.equal(rows.filter((r) => r.outcome === 'group_rejected').length, 1);
  } finally { store.close(); }
});

test('overload during identity lookup replies safely instead of disappearing or claiming a wrong account', async () => {
  const { service, replies, deps } = setup();
  deps.authorization.resolveIdentity = async () => { throw new TrackerLoadError('TRACKER_QUEUE_FULL'); };
  await service.handleEvent(event('Мой день'));
  assert.match(replies[0], /много обращений/);
  assert.doesNotMatch(replies[0], /подтвердить|TRACKER_QUEUE_FULL/);
});

test('normal private responses have exactly one Menu button at the bottom', async () => {
  const { service, messages } = setup();
  await service.handleEvent(event('меню'));
  const buttons = messages[0].buttons || [];
  assert.equal(buttons.flat().filter((button) => button.text === '📋 Меню').length, 1);
  assert.equal(buttons.at(-1)?.[0]?.text, '📋 Меню');
});
