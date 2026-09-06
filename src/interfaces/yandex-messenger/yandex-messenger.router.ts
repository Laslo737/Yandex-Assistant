import { Router } from 'express';
import { AssistantService } from '../../core/assistant/application/assistant.service';
import { DedupeStore } from '../../shared/utils/dedupe-store';
import { extractUpdates, normalizeUpdate } from './yandex-messenger.incoming';

function readSecret(headers: Record<string, unknown>): string | undefined {
  return (headers['x-webhook-secret'] || headers['x-channel-secret'] || headers['x-bot-secret']) as string | undefined;
}

export function createYandexMessengerRouter({
  assistantService,
  dedupeStore,
  webhookSecret
}: {
  assistantService: AssistantService;
  dedupeStore: DedupeStore;
  webhookSecret?: string;
}) {
  const router = Router();

  router.post('/api/interfaces/yandex-messenger/webhook', (req, res) => {
    if (webhookSecret) {
      const incomingSecret = readSecret(req.headers as Record<string, unknown>);
      if (incomingSecret !== webhookSecret) {
        return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
      }
    }

    const updates = extractUpdates(req.body);
    res.status(200).json({ ok: true });

    queueMicrotask(async () => {
      for (const update of updates) {
        try {
          const event = normalizeUpdate(update);
          const dedupeKey = `yandex:${event.eventId}`;
          if (dedupeStore.has(dedupeKey)) continue;
          dedupeStore.remember(dedupeKey);
          await assistantService.handleEvent(event);
        } catch (error) {
          console.error('yandex.webhook.processing_failed', error);
        }
      }
    });
  });

  return router;
}
