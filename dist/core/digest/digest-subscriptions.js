"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigestSubscriptions = void 0;
class DigestSubscriptions {
    store;
    sendingEnabled;
    allowlist;
    constructor(store, sendingEnabled, allowlist = []) {
        this.store = store;
        this.sendingEnabled = sendingEnabled;
        this.allowlist = allowlist;
    }
    recordContact(login, trackerId) { this.store.recordContact(login, trackerId); }
    disable(login) {
        this.store.setEnabled(login, false);
        return { text: 'Ежедневный дайджест отключён. Вернуть его можно в «Настройках дайджеста».',
            buttons: [[{ text: '⚙️ Настройки дайджеста' }]] };
    }
    handleCommand(text, login) {
        if (!['настройки дайджеста', 'включить дайджест', 'отключить дайджест'].includes(text))
            return undefined;
        if (text === 'отключить дайджест')
            return this.disable(login);
        if (text === 'включить дайджест')
            this.store.setEnabled(login, true);
        const recipient = this.store.recipient(login);
        const enabled = recipient?.enabled === true;
        const inPilot = this.allowlist.includes('*') || this.allowlist.includes(login.trim().toLowerCase());
        return {
            text: [
                '⚙️ Ежедневный дайджест', '',
                `Подписка: ${enabled ? 'включена' : 'отключена'}.`,
                'По будням, 09:00–10:30 МСК, в этот личный чат.',
                'Всего назначенных задач (включая завершённые), дедлайны на сегодня, просрочка и до трёх задач для внимания.',
                'Отчёт приходит и в дни без срочных задач. При сбое данных доставка может быть пропущена.',
                !this.sendingEnabled ? 'Рассылка пока не запущена администратором.' :
                    !inPilot ? 'Сейчас идёт пилот; ваш аккаунт пока не включён в отправку.' : ''
            ].filter(Boolean).join('\n'),
            buttons: [[{ text: '📨 Дайджест на сегодня' }], [{ text: enabled ? '🔕 Отключить дайджест' : '🔔 Включить дайджест' }]]
        };
    }
}
exports.DigestSubscriptions = DigestSubscriptions;
