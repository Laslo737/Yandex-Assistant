import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../../config/env';
import { DailyDigestService, formatDailyDigest, selectDailyFocus } from './daily-digest.service';
import { morningWindow, moscowDate, dateOnly } from './digest-calendar';
import { TrackerApiClient } from '../../integrations/yandex-tracker/tracker.client';
import { IssueAuthorizationService } from '../authorization/application/issue-authorization.service';
import { WorkdayService } from '../workday/application/workday.service';
import { shortLinkStore } from '../../shared/utils/short-link-store';

env.app.publicBaseUrl = 'https://assistant.example.test';
env.app.shortLinksDatabasePath = ':memory:';
env.tracker.webBaseUrl = 'https://tracker.example.test';
const date = '2026-11-03';

test('Moscow calendar: weekdays, UTC boundary, fixed 09:00–10:30 window and valid dates', () => {
  assert.equal(moscowDate(Date.parse('2026-11-02T21:30:00Z')), date);
  const window = morningWindow(Date.parse('2026-11-03T06:00:00Z'));
  assert.equal(window.weekday, true);
  assert.equal(window.start, Date.parse('2026-11-03T06:00:00Z'));
  assert.equal(window.end, Date.parse('2026-11-03T07:30:00Z'));
  assert.equal(morningWindow(Date.parse('2026-11-07T06:00:00Z')).weekday, false);
  assert.equal(dateOnly('2026-02-30'), undefined);
  assert.equal(dateOnly('2026-11-03'), date);
  assert.equal(dateOnly('2026-11-03T00:00:00Z'), undefined);
});

test('daily focus: today first, then high-priority overdue, tomorrow, then high priority; no duplicates/filler', () => {
  const tasks = [
    { key: 'IT-1', deadline: '2026-11-01', priorityKey: 'high' },
    { key: 'IT-2', deadline: date },
    { key: 'IT-3', deadline: date, priorityKey: 'critical' },
    { key: 'IT-4', deadline: '2026-11-04' },
    { key: 'IT-5', deadline: '2020-01-01' },
    { key: 'IT-6' },
    { key: 'IT-7', priority: 'Высокий' }
  ];
  const result = selectDailyFocus(tasks, date);
  assert.deepEqual(result.map((item) => item.task.key), ['IT-3', 'IT-2', 'IT-1']);
  assert.match(result[2].reason, /2 дн/);
  assert.deepEqual(selectDailyFocus([tasks[3], tasks[4], tasks[5], tasks[6], tasks[3]], date)
    .map((item) => item.task.key), ['IT-4', 'IT-7']);
  assert.equal(selectDailyFocus([{ key: 'IT-8' }], date).length, 0);
});

test('daily build: verified assignee, ACL before all counts, closed/cancelled excluded from urgency, date fixed to Moscow', async () => {
  const issues = [
    { id: '1', key: 'IT-1', assignee: { id: 'my-id' }, deadline: date, priority: { id: 'high', key: 'high' } },
    { id: '2', key: 'IT-2', assignee: { id: 'my-id' }, deadline: '2026-11-02' },
    { id: '3', key: 'IT-3', assignee: { id: 'my-id' }, deadline: date, statusType: { id: 'done' } },
    { id: '4', key: 'IT-4', assignee: { id: 'other-id' }, deadline: date },
    { id: '5', key: 'IT-5', assignee: { id: 'my-id' }, deadline: date },
    { id: '6', key: 'IT-6', assignee: { id: 'my-id' }, deadline: '2026-11-02', statusType: { key: 'cancelled' } }
  ];
  const searches: string[] = [];
  const tracker = { getStatuses: async () => [{ id: 'done', name: 'Закрыт', type: 'done' },
    { id: 'cancelled', name: 'Отменён', type: 'cancelled' }],
    searchIssues: async (payload: { query: string; filter?: unknown }) => {
      assert.equal(payload.filter, undefined);
      searches.push(payload.query); return { issues, pagination: { totalPages: 1 } };
    } } as unknown as TrackerApiClient;
  let strict = false;
  const authorization = {
    resolveIdentity: async () => ({ id: 'my-id', trackerLogin: 'verified.login' }),
    filterReadableSearchIssues: async (_id: string, own: typeof issues, complete: boolean) => {
      strict = complete; assert.ok(!own.some((issue) => issue.key === 'IT-4'));
      return own.filter((issue) => issue.key !== 'IT-5');
    }
  } as unknown as IssueAuthorizationService;
  const service = new DailyDigestService(tracker, authorization, new WorkdayService(tracker, authorization));
  const message = await service.build('messenger@example.test', 'my-id', date);
  assert.deepEqual(searches, ['Assignee: verified.login@ Status: !"Закрыт" Status: !"Отменён"']); assert.equal(strict, true);
  assert.match(message.text, /Активных задач на мне: 2/);
  assert.match(message.text, /С дедлайном сегодня: 1/);
  assert.match(message.text, /Просроченные: 1/);
  assert.doesNotMatch(message.text, /IT-4|IT-5|IT-3|IT-6/);
  const urls = [...message.text.matchAll(/\]\((https:\/\/assistant\.example\.test\/r\/[^)]+)\)/g)]
    .map((match) => shortLinkStore.resolve(new URL(match[1]).pathname.split('/').pop()!)!);
  const queries = urls.map((url) => new URL(url).searchParams.get('_q'));
  assert.equal(queries[0], 'Assignee: verified.login@ Status: !"Закрыт" Status: !"Отменён"');
  assert.match(queries[1]!, /Status: !"Закрыт".*Status: !"Отменён".*Deadline: 2026-11-03/);
  assert.match(queries[2]!, /Deadline: < 2026-11-03/);
  await assert.rejects(service.build('messenger@example.test', 'different-id', date), /IDENTITY_NOT_CONFIRMED/);
  authorization.filterReadableSearchIssues = async () => { throw new Error('ACL unavailable'); };
  await assert.rejects(service.build('messenger@example.test', 'my-id', date), /ACL unavailable/);
});

test('728 historical tasks: query loads only two active tasks, without archive pages or per-issue GETs', async () => {
  let searches = 0; let gets = 0; let permissions = 0;
  const issues = Array.from({ length: 728 }, (_, index) => ({ id: String(index), key: `IT-${index + 1}`,
    summary: 'Task', assignee: { id: '123' }, createdBy: { id: '123' }, followers: [], access: [], components: [],
    queue: { id: 'IT', key: 'IT' }, deadline: date,
    statusType: { id: index < 726 ? 'done' : 'open' }
  }));
  const tracker = {
    getUser: async () => ({ id: '123', login: 'test.user' }),
    getStatuses: async () => [{ id: 'done', key: 'closed', name: 'Закрыт', type: 'done' }],
    searchIssues: async (payload: { query: string; filter?: unknown; queue?: unknown }, options: { fields: string[]; page: number; perPage: number }) => {
      searches++;
      assert.equal(payload.filter, undefined); assert.equal(payload.queue, undefined);
      assert.equal(payload.query, 'Assignee: test.user@ Status: !"Закрыт"');
      for (const field of ['createdBy', 'followers', 'access', 'components']) assert.ok(options.fields.includes(field));
      return { issues: issues.filter((issue) => issue.statusType.id !== 'done'), pagination: { totalPages: 1 } };
    },
    getIssueAuthFields: async () => { gets++; throw new Error('N+1 regression'); },
    getQueueUserPermissions: async () => { permissions++; return { user: { id: '123' }, permissions: { READ: { users: [{ id: '123' }] } } }; }
  } as unknown as TrackerApiClient;
  const authorization = new IssueAuthorizationService(tracker);
  const result = await new DailyDigestService(tracker, authorization, new WorkdayService(tracker, authorization)).build('test.user', '123', date);
  assert.match(result.text, /Активных задач на мне: 2/);
  assert.doesNotMatch(result.text, /Всего задач/);
  assert.match(result.text, /С дедлайном сегодня: 2/);
  assert.deepEqual({ searches, gets, permissions }, { searches: 1, gets: 0, permissions: 1 });
});

test('daily report always has three metric links, short empty state and bounded escaped task titles', () => {
  const base = { date, login: 'test.user', today: 0, overdue: 0, active: 0, terminalStatuses: ['Закрыт'], focus: [] };
  const empty = formatDailyDigest(base);
  assert.match(empty.text, /Активных задач нет/);
  assert.equal((empty.text.match(/\/r\//g) || []).length, 3);
  assert.ok(empty.text.length < 1000);
  assert.match(formatDailyDigest({ ...base, active: 2 }).text, /Ближайших дедлайнов/);
  const task = { key: 'IT-1', summary: '[fake](https://evil.test)\n**bad**' + 'x'.repeat(300) };
  const message = formatDailyDigest({ ...base, focus: [{ task, reason: 'Срок сегодня.' }] });
  assert.doesNotMatch(message.text, /\[fake\]|\*\*bad\*\*/);
  assert.ok(message.text.length < 1200);
  assert.deepEqual(message.buttons, [[{ text: '🗓 Мой день' }], [{ text: '⚙️ Настройки дайджеста' }]]);
});
