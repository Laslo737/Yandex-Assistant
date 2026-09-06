import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';

function formatDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatAgoDays(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'сегодня';
  if (days === 1) return '1 дн назад';
  return `${days} дн назад`;
}

function shortenStatus(status?: string): string | undefined {
  if (!status) return undefined;
  return status.replace(/^цель\s+спринта$/i, 'Цель спринта');
}

function buildStatusLine(result: {
  status?: string;
  statusSilenceDays?: number;
}): string | undefined {
  const status = shortenStatus(result.status);
  if (!status && result.statusSilenceDays === undefined) return undefined;
  if (status && result.statusSilenceDays !== undefined) {
    return `🏷 Статус: ${status} — без смены ${result.statusSilenceDays} дн`;
  }
  if (status) return `🏷 Статус: ${status}`;
  return result.statusSilenceDays !== undefined ? `🏷 Статус не менялся ${result.statusSilenceDays} дн` : undefined;
}

function shortenText(value?: string, maxLength = 140): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function shortenSummary(value?: string): string | undefined {
  return shortenText(value, 120);
}

function buildRecentTaskLines(result: {
  status?: string;
  lastStatusChangeAt?: string;
  lastStatusChangedBy?: string;
}): string[] {
  const lines: string[] = [];
  const statusAt = formatDateTime(result.lastStatusChangeAt);
  if (statusAt && result.status) {
    const ago = formatAgoDays(result.lastStatusChangeAt);
    lines.push(`• ${statusAt.slice(0, 10)} ${result.lastStatusChangedBy || 'Участник процесса'} перевёл задачу в ${result.status}${ago ? ` (${ago})` : ''}`);
  }

  return lines;
}

function buildFallbackAiSummary(result: {
  overdue: boolean;
  overdueDays?: number;
  waitingForReply: boolean;
  statusSilenceDays?: number;
  staleDays?: number;
  lastCommentSnippet?: string;
  recommendations: string[];
}): string {
  const riskLine = result.overdue
    ? `- Задача просрочена${result.overdueDays !== undefined ? ` на ${result.overdueDays} дн` : ''}${result.statusSilenceDays !== undefined ? ` и уже ${result.statusSilenceDays} дн без смены статуса` : ''}; ей нужно ручное внимание.`
    : result.waitingForReply
      ? '- Задача выглядит зависшей в ожидании ответа или решения.'
      : (result.staleDays ?? 0) >= 7
        ? `- По задаче нет заметного движения уже ${result.staleDays} дн.`
        : '- По задаче стоит быстро проверить актуальность следующего шага.';

  const commentLine = result.lastCommentSnippet
    ? `- Последний видимый комментарий: ${shortenText(result.lastCommentSnippet, 150)}`
    : '- Свежего содержательного комментария по задаче почти не видно.';

  const actionLine = result.recommendations[0]
    ? `- Что сделать сейчас: ${result.recommendations[0]}`
    : '- Что сделать сейчас: уточнить следующий шаг и обновить статус задачи.';

  return [riskLine, commentLine, actionLine].join('\n');
}

function joinSection(lines: Array<string | undefined | null>): string {
  return lines.filter(Boolean).join('\n');
}

export function formatIssueAnalysis(result: {
  issueKey: string;
  summary?: string;
  status?: string;
  queue?: string;
  assignee?: string;
  updatedAt?: string;
  lastCommentAt?: string;
  lastCommentAuthor?: string;
  lastCommentSnippet?: string;
  findings: string[];
  probableCauses: string[];
  recommendations: string[];
  recentActivity: string[];
  recentComments: string[];
  nextActionOwner?: string;
  nextActionReason?: string;
  lastCommentIntent?: string;
  authorWaitingForExternalReply?: boolean;
  blockingReasonHumanized?: string;
  requestedActionHumanized?: string;
  lastStatusChangeAt?: string;
  lastStatusChangedBy?: string;
  overdue: boolean;
  overdueDays?: number;
  waitingForReply: boolean;
  staleDays?: number;
  commentSilenceDays?: number;
  statusSilenceDays?: number;
  aiSummary?: string;
}): string {
  const statusLine = buildStatusLine(result);
  const recentTaskLines = buildRecentTaskLines(result);

  const sections = [
    joinSection([
      `🆘 Анализ задачи — ${formatTrackerIssueLabel(result.issueKey)}`,
      shortenSummary(result.summary) ? `📝 ${shortenSummary(result.summary)}` : null
    ]),
    joinSection([
      result.assignee ? `👤 Исполнитель: ${result.assignee}` : null,
      statusLine,
      result.overdue ? `⏰ Срок: просрочена${result.overdueDays !== undefined ? ` на ${result.overdueDays} дн` : ''}` : null
    ]),
    joinSection([
      '🤖 Краткая выжимка от AI',
      result.aiSummary || buildFallbackAiSummary(result)
    ]),
    joinSection([
      '🕒 Последнее изменение',
      ...(recentTaskLines.length
        ? recentTaskLines.slice(0, 1)
        : (result.recentActivity.length
            ? result.recentActivity.slice(0, 1).map((item) => `• ${item}`)
            : ['• Свежей активности по комментариям и статусам почти не видно.']))
    ]),
    result.recentComments.length
      ? joinSection([
          '💬 Последние содержательные комментарии',
          ...result.recentComments.slice(0, 3).map((item) => `• ${item.replace(/^Комментарий\s*/i, '')}`)
        ])
      : null
  ].filter(Boolean);

  return sections.join('\n\n');
}
