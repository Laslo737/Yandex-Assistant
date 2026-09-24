import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantService } from './assistant.service';
import { YandexMessengerEvent } from '../../../interfaces/yandex-messenger/yandex-messenger.types';

type Deps = ConstructorParameters<typeof AssistantService>[0];
function event(text: string, type = 'private'): YandexMessengerEvent {
  return {
    eventId: '1', type: 'message', text, threadId: null,
    chat: { id: 'chat', type }, from: { login: 'test.user' },
    replyTarget: { login: 'test.user' }, metadata: { providerEventType: null }, raw: {}
  };
}
function setup() {
  const replies: string[] = [];
  const calls: string[] = [];
  const deps = {
    sender: { reply: async (_event: unknown, message: { text: string }) => { replies.push(message.text); } },
    authorization: {
      resolveUserId: async () => 'id-1',
      canReadIssue: async () => { calls.push('access'); return { allowed: false, reason: 'NO_PERMISSION' }; }
    },
    managerSummaryService: { isManagerLogin: async () => false },
    issueHelpService: {
      canHandleMessage: (text: string) => /IT-1/.test(text),
      handleMessage: async () => { calls.push('help'); throw new Error('must not run'); }
    },
    issueExplainService: { analyzeIssue: async () => { calls.push('analysis'); throw new Error('must not run'); } },
    trackerSyncService: { getIssueBundlePreview: async () => { calls.push('preview'); throw new Error('must not run'); } },
    workdayService: { getMyDayByLogin: async () => { calls.push('day'); throw new Error('must not run'); } }
  } as unknown as Deps;
  return { service: new AssistantService(deps), replies, calls };
}

test('group chat is rejected before identity lookup or Tracker access', async () => {
  const { service, replies, calls } = setup();
  await service.handleEvent(event('IT-1', 'group'));
  assert.equal(calls.length, 0);
  assert.match(replies[0], /личном чате/);
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
  const { service, replies, calls } = setup();
  await service.handleEvent(event('Почему IT-1 не двигается?'));
  assert.deepEqual(calls, ['access']);
  assert.match(replies[0], /Нет доступа/);
});

test('issue preview cannot read a denied issue', async () => {
  const { service, replies, calls } = setup();
  await service.handleEvent(event('issue EXAMPLE-2'));
  assert.deepEqual(calls, ['access']);
  assert.match(replies[0], /Нет доступа/);
});
