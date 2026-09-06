import { Router } from 'express';
import { env } from '../../config/env';
import { PlatformStatusService } from '../../core/platform/application/platform-status.service';

export function createHealthRouter({
  platformStatusService
}: {
  platformStatusService: PlatformStatusService;
}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json(platformStatusService.getHealthStatus());
  });

  router.get('/', (_req, res) => {
    res.json({
      ok: true,
      message: 'Yandex 360 AI Assistant Platform scaffold is running',
      service: env.app.name,
      version: env.app.version
    });
  });

  return router;
}
