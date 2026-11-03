import { DigestStore } from './digest.store';
import { YandexMessengerReplyMessage } from '../../interfaces/yandex-messenger/yandex-messenger.types';

export class DigestSubscriptions {
  constructor(private readonly store: DigestStore, private readonly sendingEnabled: boolean,
    private readonly allowlist: string[] = []) {}
  recordContact(login: string, trackerId: string) { this.store.recordContact(login, trackerId); }
  disable(login: string): YandexMessengerReplyMessage {
    this.store.setEnabled(login, false);
    return { text: 'Ежедневный дайджест отключён. Вернуть его можно в «Настройках дайджеста».',
      buttons: [[{ text: '⚙️ Настройки дайджеста' }]] };
  }
  handleCommand(text: string, login: string): YandexMessengerReplyMessage | undefined {
    if (!['настройки дайджеста', 'включить дайджест', 'отключить дайджест'].includes(text)) return undefined;
    if (text === 'отключить дайджест') return this.disable(login);
    if (text === 'включить дайджест') this.store.setEnabled(login, true);
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
