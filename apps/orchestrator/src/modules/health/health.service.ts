import {
  Injectable,
  ServiceUnavailableException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SERVICE_VERSION } from '../../version.js';

export interface LivenessPayload {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private readonly startedAt = Date.now();
  private shuttingDown = false;

  onApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  liveness(now: Date = new Date()): LivenessPayload {
    return {
      status: 'ok',
      version: SERVICE_VERSION,
      uptimeSeconds: Math.round((now.getTime() - this.startedAt) / 1000),
      timestamp: now.toISOString(),
    };
  }

  readiness(): { status: 'ok'; checks: { config: 'ok' } } {
    // P1-12 adds the database probe here. Until then readiness proves the
    // process booted with valid configuration.
    if (this.shuttingDown) {
      throw new ServiceUnavailableException('Shutting down');
    }
    return { status: 'ok', checks: { config: 'ok' } };
  }
}
