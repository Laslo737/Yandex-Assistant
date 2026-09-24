"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessAnalysisService = void 0;
function toDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function diffDaysFromNow(value) {
    const date = toDate(value);
    if (!date)
        return undefined;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}
function getDeadline(issue) {
    return typeof issue.deadline === 'string' ? issue.deadline : undefined;
}
function isDone(issue, doneStatusIds, doneStatusKeys) {
    const statusTypeId = issue.statusType?.id;
    const statusTypeKey = issue.statusType?.key;
    const statusId = issue.status?.id;
    const statusKey = issue.status?.key;
    if (statusTypeId === 'done' || statusTypeKey === 'done')
        return true;
    if (statusTypeId === 'cancelled' || statusTypeKey === 'cancelled')
        return true;
    if (statusId !== undefined && doneStatusIds.has(String(statusId)))
        return true;
    if (statusKey && doneStatusKeys.has(statusKey))
        return true;
    return false;
}
function isStale(issue) {
    const days = diffDaysFromNow(issue.updatedAt);
    return typeof days === 'number' && days > 7;
}
function isOverdue(issue, doneStatusIds, doneStatusKeys) {
    const deadline = getDeadline(issue);
    if (!deadline)
        return false;
    const dueDate = new Date(`${deadline}T23:59:59`);
    if (Number.isNaN(dueDate.getTime()))
        return false;
    return dueDate.getTime() < Date.now() && !isDone(issue, doneStatusIds, doneStatusKeys);
}
function getDaysInProgress(issue) {
    if (!issue.statusStartTime)
        return undefined;
    return diffDaysFromNow(issue.statusStartTime);
}
function isLongInProgress(issue) {
    const days = getDaysInProgress(issue);
    return typeof days === 'number' && days >= 10;
}
function isVeryOldStale(issue) {
    const days = diffDaysFromNow(issue.updatedAt);
    return typeof days === 'number' && days >= 90;
}
function isVeryLongInProgress(issue) {
    const days = getDaysInProgress(issue);
    return typeof days === 'number' && days >= 90;
}
function formatCount(value, one, few, many) {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11)
        return `${value} ${one}`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
        return `${value} ${few}`;
    return `${value} ${many}`;
}
function scoreQueue(item) {
    return item.active + item.overdue * 10 + item.stale * 7 + item.longInProgress * 6;
}
function scoreTask(task) {
    return (task.overdue ? 100 : 0)
        + (task.stale ? 70 : 0)
        + (task.longInProgress ? 60 : 0)
        + Math.min(task.daysInProgress || 0, 60)
        + Math.min(task.daysWithoutUpdate || 0, 60);
}
function mapTask(issue, doneStatusIds, doneStatusKeys) {
    return {
        key: issue.key,
        summary: issue.summary,
        queue: issue.queue?.display || issue.queue?.key,
        assignee: issue.assignee?.display,
        overdue: isOverdue(issue, doneStatusIds, doneStatusKeys),
        stale: isStale(issue),
        longInProgress: isLongInProgress(issue),
        veryOldStale: isVeryOldStale(issue),
        veryLongInProgress: isVeryLongInProgress(issue),
        daysWithoutUpdate: diffDaysFromNow(issue.updatedAt),
        daysInProgress: getDaysInProgress(issue)
    };
}
function parseNextIdFromLinkHeader(linkHeader) {
    if (!linkHeader)
        return undefined;
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
    if (!nextMatch?.[1])
        return undefined;
    try {
        const url = new URL(nextMatch[1]);
        return url.searchParams.get('id') || undefined;
    }
    catch {
        return undefined;
    }
}
async function fetchAllIssuesByQueue(trackerClient, queueKey, fields) {
    const perPage = 100;
    const issuesById = new Map();
    let cursorId;
    while (true) {
        const result = await trackerClient.searchIssues({
            queue: queueKey,
            order: '-updatedAt'
        }, {
            fields,
            perPage,
            id: cursorId
        });
        for (const issue of result.issues) {
            issuesById.set(issue.id, issue);
        }
        const nextId = parseNextIdFromLinkHeader(result.pagination.nextLink);
        if (!nextId || String(nextId) === String(cursorId))
            break;
        cursorId = nextId;
    }
    return Array.from(issuesById.values());
}
function isLegacyTask(task) {
    return task.veryOldStale || task.veryLongInProgress;
}
function isLiveRiskTask(task) {
    if (isLegacyTask(task))
        return false;
    if (task.overdue)
        return true;
    return task.stale || task.longInProgress;
}
function isHygieneRiskTask(task) {
    return isLegacyTask(task);
}
function isActionTask(task) {
    if (!isLiveRiskTask(task))
        return false;
    if (task.overdue && (task.daysWithoutUpdate ?? 0) <= 45)
        return true;
    if (task.stale && (task.daysWithoutUpdate ?? 0) >= 8 && (task.daysWithoutUpdate ?? 0) <= 45)
        return true;
    if (task.longInProgress && (task.daysInProgress ?? 0) >= 10 && (task.daysInProgress ?? 0) <= 45)
        return true;
    return false;
}
function dedupeLines(lines) {
    return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}
function actionScoreTask(task) {
    return (task.overdue ? 140 : 0)
        + (task.stale ? 45 : 0)
        + (task.longInProgress ? 40 : 0)
        + Math.max(0, 45 - Math.min(task.daysWithoutUpdate || 0, 45))
        + Math.max(0, 45 - Math.min(task.daysInProgress || 0, 45));
}
function buildRiskLevel(params) {
    const { activeIssues, overdueCount, staleCount, longInProgressCount, liveRiskCount } = params;
    const liveRatio = activeIssues > 0 ? liveRiskCount / activeIssues : 0;
    if ((overdueCount > 0 && liveRiskCount >= 2)
        || liveRatio >= 0.6
        || overdueCount >= 3
        || staleCount >= 6
        || longInProgressCount >= 6) {
        return 'high';
    }
    if (overdueCount > 0
        || liveRiskCount > 0
        || staleCount > 0
        || longInProgressCount > 0) {
        return 'medium';
    }
    return 'low';
}
function buildRiskType(params) {
    const { overdueCount, staleCount, oldBacklogCount, veryLongInProgressCount, longInProgressCount, liveRiskCount, hygieneRiskCount } = params;
    if (liveRiskCount > 0 && hygieneRiskCount > 0)
        return 'mixed';
    if (overdueCount > 0)
        return 'overdue';
    if (oldBacklogCount > 0 || veryLongInProgressCount > 0)
        return 'old_tail';
    if (longInProgressCount > 0 || staleCount > 0)
        return 'stuck';
    return 'overload';
}
function buildHeadline(riskLevel, legacyHeavy) {
    if (legacyHeavy)
        return 'Картина риска заметно искажена старым хвостом: сначала стоит отделить legacy-задачи от живого потока.';
    if (riskLevel === 'high')
        return 'Есть заметные процессные риски: стоит разобрать проблемные зоны.';
    if (riskLevel === 'medium')
        return 'Есть несколько точек внимания: лучше быстро разобрать, где именно стопорится работа.';
    return 'Критичных сигналов немного: ситуация выглядит управляемо.';
}
function buildMainFinding(params) {
    const { singleQueueMode, primaryQueue, riskType, overdueCount, liveRiskCount, oldBacklogCount, veryLongInProgressCount, staleCount, legacyHeavy } = params;
    const queuePrefix = singleQueueMode
        ? 'В очереди'
        : primaryQueue
            ? `Основной риск сейчас в ${primaryQueue.key}`
            : 'В доступных очередях';
    if (legacyHeavy) {
        return `${queuePrefix} накоплен большой старый хвост: без его отделения метрики переоценивают текущий operational-риск${liveRiskCount > 0 || overdueCount > 0 ? ', хотя живые проблемы тоже есть' : ''}.`;
    }
    if (riskType === 'mixed') {
        return `${queuePrefix} риск смешанный: есть живые зависания${overdueCount > 0 ? ' и просрочка' : ''}, но часть картины создаёт старый хвост.`;
    }
    if (riskType === 'old_tail') {
        return `${queuePrefix} основная проблема сейчас не в текущем потоке, а в старом хвосте: забытые задачи искажают картину и требуют отдельной чистки.`;
    }
    if (riskType === 'overdue') {
        return `${queuePrefix} есть живой риск по срокам: просроченные задачи уже требуют подтвержденного следующего шага.`;
    }
    if (riskType === 'stuck') {
        return `${queuePrefix} главный риск — зависшие активные задачи: работа висит без заметного движения и следующего шага.`;
    }
    if (liveRiskCount > 0 || staleCount > 0) {
        return `${queuePrefix} есть заметные операционные сигналы: стоит быстро разобрать, где именно зависла работа.`;
    }
    if (oldBacklogCount > 0 || veryLongInProgressCount > 0) {
        return `${queuePrefix} критичного пожара не видно, но есть старый хвост, который пора почистить.`;
    }
    return `${queuePrefix} критичных процессных проблем по базовым сигналам сейчас не видно.`;
}
function buildTaskReason(task) {
    const reasons = [];
    if (task.overdue)
        reasons.push('просрочена');
    if (task.stale && task.daysWithoutUpdate !== undefined)
        reasons.push(`без движения ${task.daysWithoutUpdate} дн.`);
    if (task.longInProgress && task.daysInProgress !== undefined)
        reasons.push(`в работе ${task.daysInProgress} дн.`);
    return reasons.join(', ');
}
class ProcessAnalysisService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async getProcessAnalysisByLogin(login, userId) {
        const isManager = await this.deps.managerSummaryService.isManagerLogin(login, true);
        if (!isManager) {
            throw new Error('Сценарий «Риски по очередям» сейчас доступен только руководителям / владельцам очередей.');
        }
        const managerContext = await this.deps.managerSummaryService.getManagerContextByLogin(login);
        const queueKeys = managerContext.queues.map((queue) => queue.key);
        const singleQueueMode = queueKeys.length <= 1;
        const fields = [
            'summary',
            'status',
            'statusType',
            'assignee',
            'updatedAt',
            'createdAt',
            'deadline',
            'queue',
            'statusStartTime'
        ];
        const doneStatusNames = managerContext.terminalStatusNames;
        const doneStatusKeys = new Set(doneStatusNames);
        const doneStatusIds = new Set();
        const issuesByQueue = await Promise.all(queueKeys.map(async (queueKey) => ({
            queueKey,
            issues: await this.deps.authorization.filterReadableIssues(userId, await fetchAllIssuesByQueue(this.deps.trackerClient, queueKey, fields))
        })));
        const activeByQueue = issuesByQueue.map(({ queueKey, issues }) => {
            const activeIssues = issues.filter((issue) => !isDone(issue, doneStatusIds, doneStatusKeys));
            const tasks = activeIssues.map((issue) => mapTask(issue, doneStatusIds, doneStatusKeys));
            const base = {
                key: queueKey,
                name: managerContext.queues.find((item) => item.key === queueKey)?.name,
                active: tasks.length,
                overdue: tasks.filter((task) => task.overdue).length,
                stale: tasks.filter((task) => task.stale).length,
                longInProgress: tasks.filter((task) => task.longInProgress).length
            };
            return {
                ...base,
                score: scoreQueue(base),
                tasks
            };
        });
        const allTasks = activeByQueue.flatMap((item) => item.tasks);
        const liveRiskTasks = allTasks.filter(isLiveRiskTask);
        const hygieneRiskTasks = allTasks.filter(isHygieneRiskTask);
        const actionTasks = allTasks.filter(isActionTask);
        const assigneeMap = new Map();
        for (const task of actionTasks.filter((item) => item.longInProgress && item.assignee && item.daysInProgress !== undefined)) {
            const key = task.assignee.trim();
            const current = assigneeMap.get(key) || { totalDays: 0, count: 0, issueKeys: [] };
            current.totalDays += task.daysInProgress || 0;
            current.count += 1;
            current.issueKeys.push(task.key);
            assigneeMap.set(key, current);
        }
        const assigneeHighlights = Array.from(assigneeMap.entries())
            .map(([assignee, value]) => ({
            assignee,
            longInProgressCount: value.count,
            averageDaysInProgress: Math.round(value.totalDays / value.count),
            topIssueKeys: value.issueKeys.slice(0, 3)
        }))
            .filter((item) => item.longInProgressCount >= 2)
            .sort((a, b) => {
            if (b.longInProgressCount !== a.longInProgressCount)
                return b.longInProgressCount - a.longInProgressCount;
            return b.averageDaysInProgress - a.averageDaysInProgress;
        })
            .slice(0, 3);
        const queueHighlights = activeByQueue
            .map(({ tasks, ...queue }) => queue)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        const overdueCount = allTasks.filter((task) => task.overdue).length;
        const staleCount = allTasks.filter((task) => task.stale).length;
        const longInProgressCount = allTasks.filter((task) => task.longInProgress).length;
        const oldBacklogCount = allTasks.filter((task) => task.veryOldStale).length;
        const veryLongInProgressCount = allTasks.filter((task) => task.veryLongInProgress).length;
        const liveOverdueCount = liveRiskTasks.filter((task) => task.overdue).length;
        const legacyOverdueCount = overdueCount - liveOverdueCount;
        const riskTaskCount = allTasks.filter((task) => task.overdue || task.stale || task.longInProgress).length;
        const legacyHeavy = riskTaskCount > 0 && hygieneRiskTasks.length / riskTaskCount >= 0.35;
        const primaryQueue = queueHighlights[0];
        const riskLevel = buildRiskLevel({
            activeIssues: allTasks.length,
            overdueCount: liveOverdueCount,
            staleCount: liveRiskTasks.filter((task) => task.stale).length,
            longInProgressCount: liveRiskTasks.filter((task) => task.longInProgress).length,
            liveRiskCount: liveRiskTasks.length
        });
        const riskType = buildRiskType({
            overdueCount: liveOverdueCount,
            staleCount: liveRiskTasks.filter((task) => task.stale).length,
            oldBacklogCount,
            veryLongInProgressCount,
            longInProgressCount: liveRiskTasks.filter((task) => task.longInProgress).length,
            liveRiskCount: liveRiskTasks.length,
            hygieneRiskCount: hygieneRiskTasks.length
        });
        const headline = buildHeadline(riskLevel, legacyHeavy);
        const mainFinding = buildMainFinding({
            singleQueueMode,
            primaryQueue,
            riskType,
            overdueCount,
            liveRiskCount: liveRiskTasks.length,
            oldBacklogCount,
            veryLongInProgressCount,
            staleCount,
            legacyHeavy
        });
        let mainRisk;
        if (primaryQueue && legacyHeavy) {
            mainRisk = `Основной риск сейчас в ${primaryQueue.key}: большая часть сильных сигналов смешана со старым хвостом, поэтому сначала нужно отделить legacy-задачи от живого потока.`;
        }
        else if (singleQueueMode && queueKeys[0] && (overdueCount > 0 || staleCount > 0 || longInProgressCount > 0)) {
            mainRisk = `Главная зона риска — ${queueKeys[0]}: просрочено ${overdueCount}, без движения ${staleCount}, долго в работе ${longInProgressCount}.`;
        }
        else if (primaryQueue && (primaryQueue.overdue > 0 || primaryQueue.stale > 0 || primaryQueue.longInProgress > 0)) {
            mainRisk = `Главная зона риска сейчас — ${primaryQueue.key}: просрочено ${primaryQueue.overdue}, без движения ${primaryQueue.stale}, долго в работе ${primaryQueue.longInProgress}.`;
        }
        else if (liveOverdueCount > 0) {
            mainRisk = `Главный риск сейчас — живые просроченные задачи: ${liveOverdueCount}.`;
        }
        else if (liveRiskTasks.length > 0) {
            mainRisk = `Главный риск сейчас — зависшие активные задачи: ${liveRiskTasks.length}.`;
        }
        const keySignals = [];
        const liveStaleCount = liveRiskTasks.filter((task) => task.stale).length;
        const liveLongInProgressCount = liveRiskTasks.filter((task) => task.longInProgress).length;
        const hasMostlySameStaleAndLongInProgress = liveStaleCount > 0
            && liveLongInProgressCount > 0
            && Math.abs(liveStaleCount - liveLongInProgressCount) <= Math.max(1, Math.round(Math.max(liveStaleCount, liveLongInProgressCount) * 0.15));
        if (overdueCount > 0) {
            if (legacyOverdueCount > 0 && legacyOverdueCount >= liveOverdueCount) {
                keySignals.push(`Просрочено ${formatCount(overdueCount, 'задача', 'задачи', 'задач')}; значительная часть просрочки выглядит как старый хвост, а не как свежий стопор.`);
            }
            else if (overdueCount === 1) {
                keySignals.push('1 задача уже просрочена и требует подтвержденного следующего шага.');
            }
            else {
                keySignals.push(`${overdueCount} задач уже просрочены и требуют подтвержденного следующего шага.`);
            }
        }
        if (hasMostlySameStaleAndLongInProgress && liveStaleCount > 0) {
            keySignals.push(`${formatCount(liveStaleCount, 'активная задача зависла', 'активные задачи зависли', 'активных задач зависли')}: они не двигаются больше 7 дней и слишком долго находятся в работе.`);
        }
        else {
            if (liveStaleCount > 0) {
                keySignals.push(`${formatCount(liveStaleCount, 'активная задача не двигалась', 'активные задачи не двигались', 'активных задач не двигались')} больше 7 дней.`);
            }
            if (liveLongInProgressCount > 0) {
                keySignals.push(`${formatCount(liveLongInProgressCount, 'задача слишком долго находится', 'задачи слишком долго находятся', 'задач слишком долго находятся')} в работе.`);
            }
        }
        if (legacyHeavy || oldBacklogCount > 0 || veryLongInProgressCount > 0) {
            const backlogCount = Math.max(oldBacklogCount, veryLongInProgressCount);
            keySignals.push(`Старый хвост заметно искажает картину: как минимум ${backlogCount} ${formatCount(backlogCount, 'задача', 'задачи', 'задач').replace(/^\d+\s/, '')} без движения или в работе 90+ дней.`);
        }
        const strongestAssignee = assigneeHighlights[0];
        if (strongestAssignee && strongestAssignee.longInProgressCount >= 2) {
            keySignals.push(`Есть локальная концентрация по владельцу: ${strongestAssignee.assignee} держит ${formatCount(strongestAssignee.longInProgressCount, 'задачу', 'задачи', 'задач')} в среднем ${strongestAssignee.averageDaysInProgress} дн. в работе.`);
        }
        const summaryLines = dedupeLines(keySignals).slice(0, 4);
        const oldBacklogLines = [];
        if (oldBacklogCount > 0) {
            oldBacklogLines.push(`${formatCount(oldBacklogCount, 'задача не обновлялась', 'задачи не обновлялись', 'задач не обновлялись')} 90+ дней.`);
        }
        if (veryLongInProgressCount > 0) {
            oldBacklogLines.push(`${formatCount(veryLongInProgressCount, 'задача находится', 'задачи находятся', 'задач находятся')} в работе 90+ дней.`);
        }
        const prioritizedLiveTasks = (actionTasks.length ? actionTasks : liveRiskTasks)
            .slice()
            .sort((a, b) => actionScoreTask(b) - actionScoreTask(a));
        const liveRiskLines = prioritizedLiveTasks
            .slice(0, 3)
            .map((task) => `${task.key} — ${buildTaskReason(task) || 'требует проверки статуса и следующего шага'}.`);
        const hygieneRiskLines = hygieneRiskTasks
            .slice()
            .sort((a, b) => scoreTask(b) - scoreTask(a))
            .slice(0, 3)
            .map((task) => `${task.key} — похоже на старый хвост: ${buildTaskReason(task) || 'давно не актуализировалась'}.`);
        const todayActions = dedupeLines([
            actionTasks[0] ? `Сначала разобрать ${actionTasks[0].key} и подтвердить по ней следующий шаг.` : '',
            liveRiskTasks.length > 0 ? 'Поднять живые зависшие задачи и проверить по ним владельца и актуальный план.' : '',
            (oldBacklogCount > 0 || veryLongInProgressCount > 0) ? 'Отдельно зачистить старый хвост: закрыть неактуальные задачи или вернуть их в рабочий контур.' : '',
            !singleQueueMode && primaryQueue && primaryQueue.score > 0 ? `Сначала посмотреть очередь ${primaryQueue.key}: там сейчас наибольшая концентрация риска.` : '',
            !liveRiskTasks.length && !oldBacklogCount && !veryLongInProgressCount ? 'Критичных действий не требуется: достаточно обычного контроля статусов и сроков.' : '',
            ((actionTasks.length > 0 || liveRiskTasks.length > 0) && (oldBacklogCount > 0 || veryLongInProgressCount > 0)) ? 'После разбора живых задач заново оценить очередь: часть сигнала сейчас создаётся старым хвостом.' : ''
        ]).slice(0, 4);
        return {
            manager: managerContext.manager,
            queues: managerContext.queues,
            terminalStatusNames: managerContext.terminalStatusNames,
            singleQueueMode,
            primaryQueueKey: primaryQueue?.key,
            activeIssues: allTasks.length,
            overdueCount,
            staleCount,
            longInProgressCount,
            oldBacklogCount,
            veryLongInProgressCount,
            riskLevel,
            riskType,
            headline,
            mainRisk,
            mainFinding,
            summaryLines,
            keySignals: summaryLines,
            liveRiskLines,
            hygieneRiskLines,
            oldBacklogLines,
            todayActions,
            firstActionTask: actionTasks[0],
            queueHighlights,
            assigneeHighlights,
            topTasks: [
                ...prioritizedLiveTasks.slice(0, 3),
                ...hygieneRiskTasks
                    .slice()
                    .sort((a, b) => scoreTask(b) - scoreTask(a))
                    .slice(0, Math.max(0, 5 - Math.min(3, prioritizedLiveTasks.length)))
            ].slice(0, 5)
        };
    }
}
exports.ProcessAnalysisService = ProcessAnalysisService;
