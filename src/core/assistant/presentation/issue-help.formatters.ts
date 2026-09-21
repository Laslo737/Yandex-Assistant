import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';
import { truncateText } from '../../../shared/utils/text';

export function formatIssueHelpResult(result: {
  issueKey: string;
  request: string;
  aiAnswer?: string;
  aiUsed?: boolean;
  contextPack: {
    meta: {
      summary?: string;
      status?: string;
      queue?: string;
      assignee?: string;
      priority?: string;
      type?: string;
      deadline?: string;
      parent?: string;
      commentsCount: number;
      changelogCount: number;
      tags?: string[];
    };
    heuristics: {
      probableCauses: string[];
      recommendations: string[];
      nextActionOwner?: string;
      authorWaitingForExternalReply?: boolean;
      needsApproval?: boolean;
    };
    highlights?: {
      latestComment?: string;
      latestStatusChange?: string;
      latestFieldChange?: string;
      latestAskComment?: string;
      latestDecisionComment?: string;
      latestBlockingComment?: string;
    };
    derived?: {
      issuePurpose?: string;
      agreedWhat?: string;
      remainingOpenPoint?: string;
      waitingTopic?: string;
      waitingTopicSourceComment?: string;
      lastConcreteAsk?: string;
      waitingSubject?: string;
      waitingQuestion?: string;
      blockingReasonHumanized?: string;
      requestedActionHumanized?: string;
      lastCommentIntent?: string;
    };
    evidence?: Array<{ label: string; detail: string }>;
    comments: Array<{ author?: string; updatedAt?: string; text?: string }>;
    changelog: Array<{ updatedAt?: string; updatedBy?: string; changes: string[] }>;
  };
}): string {
  const { meta, heuristics, derived } = result.contextPack;
  const statusParts = [
    meta.status ? `Статус: ${meta.status}` : undefined,
    meta.assignee ? `Исполнитель: ${meta.assignee}` : undefined,
    meta.deadline ? `Дедлайн: ${meta.deadline}` : undefined
  ].filter(Boolean);

  if (result.aiUsed && result.aiAnswer) {
    return [
      `🆘 ${formatTrackerIssueLabel(result.issueKey)}${meta.summary ? ` — ${meta.summary}` : ''}`,
      statusParts.length ? `📌 ${statusParts.join(' · ')}` : null,
      '',
      truncateText(result.aiAnswer.trim(), 1800)
    ].filter((line): line is string => line !== null).join('\n');
  }

  const observations = [
    derived?.issuePurpose,
    ...heuristics.probableCauses.slice(0, 2),
    derived?.requestedActionHumanized
      ? `Сейчас требуется: ${derived.requestedActionHumanized}`
      : derived?.lastConcreteAsk
        ? `Последний открытый вопрос: ${derived.lastConcreteAsk}`
        : undefined,
    heuristics.nextActionOwner ? `Следующий шаг: ${heuristics.nextActionOwner}` : undefined
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

  return [
    `🆘 ${formatTrackerIssueLabel(result.issueKey)}${meta.summary ? ` — ${meta.summary}` : ''}`,
    statusParts.length ? `📌 ${statusParts.join(' · ')}` : null,
    '',
    'Коротко:',
    ...(observations.length ? observations.slice(0, 4).map((item) => `• ${item}`) : ['• Явная причина задержки по данным задачи не найдена.']),
    '',
    'Что делать:',
    ...(heuristics.recommendations.length
      ? heuristics.recommendations.slice(0, 2).map((item) => `• ${item}`)
      : ['• Проверить последний комментарий и уточнить владельца следующего шага.'])
  ].filter((line): line is string => line !== null).join('\n');
}
