import { TrackerSyncService } from '../../tracker/application/tracker-sync.service';
import { TrackerIssueSyncBundle } from '../../tracker/domain/tracker-sync.types';
import {
  TrackerChangelogEntry,
  TrackerChangelogFieldChange,
  TrackerComment,
  TrackerIssue,
  TrackerUser
} from '../../../integrations/yandex-tracker/tracker.types';
import { normalizeTrackerCommentText } from '../../../shared/utils/tracker-comment-text';
import { inferIssueNextStep, IssueCommentIntent } from './issue-next-step-inference';

export interface IssueExplainResult {
  issueKey: string;
  summary?: string;
  status?: string;
  queue?: string;
  assignee?: string;
  updatedAt?: string;
  lastCommentAt?: string;
  lastCommentAuthor?: string;
  lastCommentSnippet?: string;
  lastStatusChangeAt?: string;
  lastStatusChangedBy?: string;
  overdue: boolean;
  overdueDays?: number;
  waitingForReply: boolean;
  staleDays?: number;
  commentSilenceDays?: number;
  statusSilenceDays?: number;
  nextActionOwner?: string;
  nextActionReason?: string;
  lastCommentIntent?: IssueCommentIntent;
  authorWaitingForExternalReply?: boolean;
  authorLikelyOwnsNextStep?: boolean;
  needsApproval?: boolean;
  blockingReasonHumanized?: string;
  requestedActionHumanized?: string;
  waitingSubject?: string;
  waitingQuestion?: string;
  findings: string[];
  probableCauses: string[];
  recommendations: string[];
  recentActivity: string[];
  recentComments: string[];
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(value?: string): number | undefined {
  const date = toDate(value);
  if (!date) return undefined;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function getDeadline(issue: TrackerIssue): string | undefined {
  return typeof issue.deadline === 'string' ? issue.deadline : undefined;
}

function getOverdueDays(issue: TrackerIssue): number | undefined {
  const deadline = getDeadline(issue);
  if (!deadline) return undefined;
  const dueDate = new Date(`${deadline}T23:59:59`);
  if (Number.isNaN(dueDate.getTime())) return undefined;
  const done = issue.statusType?.id === 'done' || issue.statusType?.key === 'done';
  const cancelled = issue.statusType?.id === 'cancelled' || issue.statusType?.key === 'cancelled';
  if (done || cancelled) return undefined;
  if (dueDate.getTime() >= Date.now()) return undefined;
  return Math.max(1, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
}

function isOverdue(issue: TrackerIssue): boolean {
  return getOverdueDays(issue) !== undefined;
}

function isStatusFieldChange(field: TrackerChangelogFieldChange): boolean {
  const fieldId = String(field.field?.id ?? '').toLowerCase();
  const fieldKey = String(field.field?.key ?? '').toLowerCase();
  const fieldDisplay = String(field.field?.display ?? '').toLowerCase();
  return fieldId === 'status' || fieldKey === 'status' || fieldDisplay.includes('статус') || fieldDisplay === 'status';
}

function findLastStatusChange(changelog: TrackerChangelogEntry[]): TrackerChangelogEntry | undefined {
  return changelog
    .slice()
    .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0))
    .find((entry) => entry.fields?.some(isStatusFieldChange));
}

function isRobotUser(user?: TrackerUser | null): boolean {
  const display = String(user?.display || '').toLowerCase();
  const id = String(user?.id || '').toLowerCase();
  return display.includes('робот') || display.includes('robot') || id.includes('robot');
}

function isMeaningfulComment(comment: TrackerComment): boolean {
  const text = normalizeTextSnippet(comment.text, 220)?.toLowerCase();
  if (!text) return false;
  if (isRobotUser(comment.updatedBy || comment.createdBy)) return false;
  if (text.length < 12) return false;
  if (/^(ок|хорошо|спасибо|понял|привет)$/i.test(text)) return false;
  return true;
}

function findLastHumanComment(comments: TrackerComment[]): TrackerComment | undefined {
  const sorted = comments
    .slice()
    .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));

  return sorted.find(isMeaningfulComment) || sorted.find((comment) => !isRobotUser(comment.updatedBy || comment.createdBy)) || sorted[0];
}

function userDisplay(user?: TrackerUser | null): string | undefined {
  return user?.display;
}

function normalizeTextSnippet(value?: string, maxLength = 160): string | undefined {
  return normalizeTrackerCommentText(value, maxLength);
}

function fieldValueLabel(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    const labels = value
      .map((item) => fieldValueLabel(item))
      .filter(Boolean) as string[];
    return labels.length ? labels.join(', ') : undefined;
  }

  if (typeof value === 'object') {
    const candidate = value as { display?: string; key?: string; id?: string | number };
    return candidate.display || candidate.key || (candidate.id !== undefined ? String(candidate.id) : undefined);
  }

  return undefined;
}

function formatRelativeDays(value?: string): string | undefined {
  const days = diffDays(value);
  if (days === undefined) return undefined;
  if (days <= 0) return 'сегодня';
  if (days === 1) return '1 дн назад';
  return `${days} дн назад`;
}

function isAdministrativeComment(comment: TrackerComment): boolean {
  const text = normalizeTextSnippet(comment.text, 220)?.toLowerCase();
  if (!text) return false;

  return [
    /пока исполнителем тебя постав/i,
    /снова меня постав.*исполнител/i,
    /поставлю.*исполнител/i,
    /поставь.*исполнител/i,
    /верни.*исполнител/i,
    /сменил.*исполнител/i,
    /поменял.*исполнител/i,
    /назначил.*исполнител/i,
    /пока тебя постав/i,
    /можешь снова меня поставить/i
  ].some((pattern) => pattern.test(text));
}

function buildRecentComments(comments: TrackerComment[]): string[] {
  const sortedComments = comments
    .slice()
    .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));

  const preferredComments = [
    ...sortedComments.filter((comment) => isMeaningfulComment(comment) && !isAdministrativeComment(comment)),
    ...sortedComments.filter((comment) => isMeaningfulComment(comment) && isAdministrativeComment(comment)),
    ...sortedComments.filter((comment) => !isRobotUser(comment.updatedBy || comment.createdBy) && !isMeaningfulComment(comment)),
    ...sortedComments.filter((comment) => isRobotUser(comment.updatedBy || comment.createdBy))
  ];

  return Array.from(new Set(preferredComments.map((comment) => String(comment.id))))
    .map((id) => preferredComments.find((comment) => String(comment.id) === id))
    .filter((comment): comment is TrackerComment => Boolean(comment))
    .slice(0, 3)
    .map((comment) => {
      const snippet = normalizeTextSnippet(comment.text, 160);
      return `Комментарий${userDisplay(comment.updatedBy || comment.createdBy) ? ` от ${userDisplay(comment.updatedBy || comment.createdBy)}` : ''}${comment.updatedAt ? ` — ${formatRelativeDays(comment.updatedAt)}` : ''}${snippet ? `: ${snippet}` : ''}`;
    });
}

function buildRecentActivity(comments: TrackerComment[], changelog: TrackerChangelogEntry[]): string[] {
  const sortedComments = comments
    .slice()
    .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));

  const preferredComments = [
    ...sortedComments.filter(isMeaningfulComment),
    ...sortedComments.filter((comment) => !isRobotUser(comment.updatedBy || comment.createdBy) && !isMeaningfulComment(comment)),
    ...sortedComments.filter((comment) => isRobotUser(comment.updatedBy || comment.createdBy))
  ];

  const commentLines = Array.from(new Set(preferredComments.map((comment) => String(comment.id))))
    .map((id) => preferredComments.find((comment) => String(comment.id) === id))
    .filter((comment): comment is TrackerComment => Boolean(comment))
    .slice(0, 2)
    .map((comment) => {
      const snippet = normalizeTextSnippet(comment.text);
      return `Комментарий${userDisplay(comment.updatedBy || comment.createdBy) ? ` от ${userDisplay(comment.updatedBy || comment.createdBy)}` : ''}${comment.updatedAt ? ` — ${diffDays(comment.updatedAt)}д назад` : ''}${snippet ? `: ${snippet}` : ''}`;
    });

  const statusLines = changelog
    .slice()
    .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0))
    .filter((entry) => entry.fields?.some(isStatusFieldChange))
    .slice(0, 2)
    .map((entry) => {
      const statusChange = entry.fields?.find(isStatusFieldChange);
      const fromLabel = fieldValueLabel(statusChange?.from) || 'неизвестно';
      const toLabel = fieldValueLabel(statusChange?.to) || 'неизвестно';
      return `Статус: ${fromLabel} → ${toLabel}${entry.updatedBy?.display ? ` (${entry.updatedBy.display})` : ''}${entry.updatedAt ? ` — ${diffDays(entry.updatedAt)}д назад` : ''}`;
    });

  return Array.from(new Set([...statusLines, ...commentLines])).slice(0, 4);
}

export class IssueExplainService {
  constructor(private readonly trackerSyncService: TrackerSyncService) {}

  async analyzeIssue(issueIdOrKey: string, providedBundle?: TrackerIssueSyncBundle): Promise<IssueExplainResult> {
    const bundle = providedBundle ?? await this.trackerSyncService.fetchIssueBundle(issueIdOrKey);
    const issue = bundle.issue;
    const lastComment = findLastHumanComment(bundle.comments);
    const lastStatusChange = findLastStatusChange(bundle.changelog);

    const staleDays = diffDays(issue.updatedAt);
    const commentSilenceDays = diffDays(lastComment?.updatedAt || issue.lastCommentUpdatedAt);
    const statusSilenceDays = diffDays(lastStatusChange?.updatedAt);
    const overdueDays = getOverdueDays(issue);
    const overdue = overdueDays !== undefined;
    const nextAction = inferIssueNextStep({
      comments: bundle.comments,
      assignee: issue.assignee?.display,
      lastStatusChangedBy: lastStatusChange?.updatedBy?.display
    });
    const waitingForReply = nextAction.authorWaitingForExternalReply;

    const findings: string[] = [];
    const probableCauses: string[] = [];
    const recommendations: string[] = [];

    if (staleDays !== undefined) {
      findings.push(`Задача не обновлялась ${staleDays} дн.`);
      if (staleDays >= 7) {
        probableCauses.push('По задаче давно нет нового движения.');
        recommendations.push('Проверить, актуальна ли задача, и обновить статус или следующий шаг.');
      }
    }

    if (statusSilenceDays !== undefined) {
      findings.push(`Статус не менялся ${statusSilenceDays} дн.`);
      if (statusSilenceDays >= 7) {
        probableCauses.push('Задача могла застрять в одном статусе без дальнейшего продвижения.');
        recommendations.push('Уточнить у исполнителя, что блокирует следующий переход по статусу.');
      }
    }

    if (commentSilenceDays !== undefined) {
      findings.push(`Комментариев / коммуникации не было ${commentSilenceDays} дн.`);
      if (commentSilenceDays >= 5) {
        probableCauses.push('По задаче нет свежей коммуникации, поэтому она может быть забыта или зависла без ответа.');
        recommendations.push('Попросить краткий апдейт по задаче или зафиксировать текущий статус в комментарии.');
      }
    }

    if (waitingForReply) {
      findings.push('Задача ожидает ответа от участника процесса.');
      probableCauses.push('Движение по задаче остановилось на этапе ожидания ответа.');
      recommendations.push('Проверить, кто должен ответить, и ускорить коммуникацию по задаче.');
    }

    if (overdue) {
      findings.push('Срок задачи уже просрочен.');
      probableCauses.push('Плановый срок прошел, а задача не была завершена или перепланирована.');
      recommendations.push('Обновить дедлайн или согласовать план закрытия задачи.');
    }

    if (!probableCauses.length) {
      probableCauses.push('Явной критичной причины не видно, но стоит проверить актуальность статуса и следующего шага.');
    }

    return {
      issueKey: issue.key,
      summary: issue.summary,
      status: issue.status?.display,
      queue: issue.queue?.display || issue.queue?.key,
      assignee: issue.assignee?.display,
      updatedAt: issue.updatedAt,
      lastCommentAt: nextAction.lastCommentAt || issue.lastCommentUpdatedAt,
      lastCommentAuthor: nextAction.lastCommentAuthor || userDisplay(lastComment?.updatedBy || lastComment?.createdBy),
      lastCommentSnippet: nextAction.lastCommentSnippet || normalizeTextSnippet(lastComment?.text, 140),
      lastStatusChangeAt: lastStatusChange?.updatedAt,
      lastStatusChangedBy: lastStatusChange?.updatedBy?.display,
      overdue,
      overdueDays,
      waitingForReply,
      staleDays,
      commentSilenceDays,
      statusSilenceDays,
      nextActionOwner: nextAction.nextActionOwner,
      nextActionReason: nextAction.nextActionReason,
      lastCommentIntent: nextAction.lastCommentIntent,
      authorWaitingForExternalReply: nextAction.authorWaitingForExternalReply,
      authorLikelyOwnsNextStep: nextAction.authorLikelyOwnsNextStep,
      needsApproval: nextAction.needsApproval,
      blockingReasonHumanized: nextAction.blockingReasonHumanized,
      requestedActionHumanized: nextAction.requestedActionHumanized,
      waitingSubject: nextAction.waitingSubject,
      waitingQuestion: nextAction.waitingQuestion,
      findings: Array.from(new Set([
        ...findings,
        nextAction.blockingReasonHumanized,
        nextAction.requestedActionHumanized ? `По смыслу сейчас нужен следующий шаг: ${nextAction.requestedActionHumanized}.` : undefined
      ].filter(Boolean) as string[])).slice(0, 5),
      probableCauses: Array.from(new Set([
        ...probableCauses,
        nextAction.blockingReasonHumanized,
        nextAction.authorWaitingForExternalReply ? 'Последний содержательный комментарий показывает, что автор уже ждет внешнюю реакцию, а не сам держит следующий шаг.' : undefined
      ].filter(Boolean) as string[])).slice(0, 3),
      recommendations: Array.from(new Set([
        ...recommendations,
        nextAction.requestedActionHumanized
          ? `Получить/зафиксировать: ${nextAction.requestedActionHumanized}.`
          : undefined
      ].filter(Boolean) as string[])).slice(0, 3),
      recentActivity: buildRecentActivity(bundle.comments, bundle.changelog),
      recentComments: buildRecentComments(bundle.comments)
    };
  }
}
