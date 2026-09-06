import { env } from '../../../config/env';
import { TrackerSyncService } from '../../tracker/application/tracker-sync.service';

export class PlatformStatusService {
  constructor(private readonly trackerSyncService: TrackerSyncService) {}

  getHealthStatus() {
    return {
      ok: true,
      service: env.app.name,
      version: env.app.version,
      environment: env.app.nodeEnv,
      interfaces: {
        yandexMessenger: env.yandexMessenger.enabled
      },
      integrations: {
        tracker: this.trackerSyncService.getStatus()
      }
    };
  }
}
