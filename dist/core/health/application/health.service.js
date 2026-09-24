"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
function getStatusLabel(score) {
    if (score >= 85)
        return '🟢 стабильно';
    if (score >= 65)
        return '🟡 требует внимания';
    return '🔴 зона риска';
}
function getBaseScoreByProblemRatio(problemRatio) {
    if (problemRatio <= 0)
        return 100;
    if (problemRatio <= 0.1)
        return 92;
    if (problemRatio <= 0.25)
        return 82;
    if (problemRatio <= 0.4)
        return 68;
    if (problemRatio <= 0.6)
        return 52;
    if (problemRatio <= 0.75)
        return 38;
    if (problemRatio <= 0.9)
        return 22;
    return 10;
}
function getQueueHealthLabel(queue) {
    const base = 100
        - queue.overdue * 12
        - (queue.active > 0 ? (queue.stale / queue.active) * 45 : 0);
    const score = clampScore(base);
    return getStatusLabel(score);
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
class HealthService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async getHealthByLogin(login, userId) {
        const isManager = await this.deps.managerSummaryService.isManagerLogin(login, true);
        if (!isManager) {
            throw new Error('Health check сейчас доступен только владельцам очередей / руководителям.');
        }
        const [summary, processAnalysis] = await Promise.all([
            this.deps.managerSummaryService.getSummaryByLogin(login, userId),
            this.deps.processAnalysisService.getProcessAnalysisByLogin(login, userId)
        ]);
        const problemRatio = summary.activeIssues > 0 ? summary.problematicCount / summary.activeIssues : 0;
        const overdueRatio = summary.activeIssues > 0 ? summary.overdueCount / summary.activeIssues : 0;
        const staleRatio = summary.activeIssues > 0 ? summary.staleCount / summary.activeIssues : 0;
        const baseScore = getBaseScoreByProblemRatio(problemRatio)
            - overdueRatio * 25
            - staleRatio * 8;
        const score = clampScore(baseScore);
        const risks = [];
        const recommendations = [];
        if (summary.overdueCount > 0) {
            risks.push(`Есть просроченные задачи: ${formatCount(summary.overdueCount, 'задача', 'задачи', 'задач')}.`);
            recommendations.push('Разобрать просроченные задачи и подтвердить ответственных и сроки.');
        }
        if (summary.staleCount > 0) {
            risks.push(`Есть задачи без движения больше 7 дней: ${formatCount(summary.staleCount, 'задача', 'задачи', 'задач')}.`);
            recommendations.push('Разобрать зависшие задачи и снять блокировки или закрыть неактуальные.');
        }
        const overloadedQueues = summary.queueStats
            .filter((queue) => queue.active >= 25)
            .sort((a, b) => b.active - a.active)
            .slice(0, 2);
        for (const queue of overloadedQueues) {
            risks.push(`Высокая активная нагрузка в очереди ${queue.key}: ${queue.active} активных задач.`);
        }
        if (!recommendations.length) {
            recommendations.push('Ситуация стабильна: продолжать регулярный контроль и обновление статусов.');
        }
        const queueHighlights = summary.queueStats
            .slice()
            .sort((a, b) => (b.overdue * 10 + b.stale * 3) - (a.overdue * 10 + a.stale * 3))
            .slice(0, 5)
            .map((queue) => ({
            key: queue.key,
            name: queue.name,
            active: queue.active,
            overdue: queue.overdue,
            stale: queue.stale,
            healthLabel: getQueueHealthLabel(queue)
        }));
        const whatHappened = [
            `В активной работе ${formatCount(summary.activeIssues, 'задача', 'задачи', 'задач')} по ${formatCount(summary.queues.length, 'очереди', 'очередям', 'очередям')}.`,
            summary.overdueCount > 0 ? `Просрочено ${formatCount(summary.overdueCount, 'задача', 'задачи', 'задач')}.` : 'Явных просрочек сейчас нет.',
            summary.staleCount > 0 ? `${formatCount(summary.staleCount, 'задача', 'задачи', 'задач')} давно без движения.` : 'Критичных stale-задач не видно.'
        ];
        const bottlenecks = [];
        const primaryQueue = queueHighlights[0];
        if (primaryQueue && summary.queues.length > 1 && (primaryQueue.overdue > 0 || primaryQueue.stale > 0)) {
            bottlenecks.push(`Самая напряженная зона сейчас — ${primaryQueue.key}: просрочено ${primaryQueue.overdue}, без движения ${primaryQueue.stale}.`);
        }
        if (summary.staleCount > 0) {
            bottlenecks.push('Основной тормозящий сигнал — задачи без движения: они создают ощущение, что работа висит без следующего шага.');
        }
        if (summary.overdueCount > 0) {
            bottlenecks.push('Есть просроченные задачи: это уже прямой риск по срокам и ожиданиям команды/бизнеса.');
        }
        if (!bottlenecks.length) {
            bottlenecks.push('Явного узкого места не видно: поток выглядит достаточно ровным.');
        }
        const todayActions = Array.from(new Set([
            ...processAnalysis.todayActions,
            ...recommendations
        ].filter((item, index, array) => {
            if (item.includes('зависш') && array.some((other, otherIndex) => otherIndex !== index && other.includes('зависш'))) {
                return index === array.findIndex((value) => value.includes('зависш'));
            }
            if (item.includes('просроч') && array.some((other, otherIndex) => otherIndex !== index && other.includes('просроч'))) {
                return index === array.findIndex((value) => value.includes('просроч'));
            }
            return true;
        })))
            .filter((item) => !(summary.queues.length <= 1 && item.includes('Отдельно посмотреть очередь')))
            .filter((item) => !item.includes('старый хвост'))
            .slice(0, 3);
        const oldBacklogLines = [];
        let headline = 'Команда выглядит стабильно: критичных отклонений немного.';
        if (score < 65) {
            headline = 'Есть заметные риски: сегодня нужен управленческий разбор проблемных зон.';
        }
        else if (score < 85) {
            headline = 'Ситуация управляемая, но есть несколько точек внимания на сегодня.';
        }
        const singleQueueMainRisk = summary.queues.length === 1 && (summary.overdueCount > 0 || summary.staleCount > 0 || processAnalysis.longInProgressCount > 0)
            ? `Главная зона риска — ${summary.queues[0].key}: просрочено ${summary.overdueCount}, без движения ${summary.staleCount}, долго в работе ${processAnalysis.longInProgressCount}.`
            : undefined;
        const healthTopTasks = processAnalysis.firstActionTask
            ? [
                processAnalysis.firstActionTask,
                ...processAnalysis.topTasks.filter((task) => task.key !== processAnalysis.firstActionTask?.key)
            ].slice(0, 5)
            : processAnalysis.topTasks;
        return {
            manager: summary.manager,
            queues: summary.queues,
            terminalStatusNames: summary.terminalStatusNames,
            score,
            statusLabel: getStatusLabel(score),
            headline,
            mainRisk: singleQueueMainRisk || processAnalysis.mainRisk,
            whatHappened,
            bottlenecks,
            todayActions,
            oldBacklogLines,
            overdueCount: summary.overdueCount,
            staleCount: summary.staleCount,
            activeIssues: summary.activeIssues,
            risks,
            recommendations,
            queueHighlights,
            topTasks: healthTopTasks.map((task) => ({
                key: task.key,
                summary: task.summary,
                queue: task.queue,
                assignee: task.assignee,
                overdue: task.overdue,
                stale: task.stale
            }))
        };
    }
}
exports.HealthService = HealthService;
