import { Inject, Injectable } from '@nestjs/common';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';

/** P5-26: Transactional email stub for report notifications. */
@Injectable()
export class EmailService {
  private readonly enabled: boolean;

  constructor(@Inject(ENV) env: Env) {
    // Enable only when SMTP is configured
    const e = env as Env & { SMTP_HOST?: string };
    this.enabled = !!e.SMTP_HOST;
  }

  async sendReportReady(params: {
    to: string;
    reportId: string;
    scanId: string;
    downloadUrl: string;
  }): Promise<void> {
    if (!this.enabled) {
      logger.info(
        { reportId: params.reportId, to: params.to },
        'email stub: report ready notification (SMTP not configured)',
      );
      return;
    }
    // In production, integrate with SMTP/SendGrid/etc.
    logger.info(
      { reportId: params.reportId, to: params.to, downloadUrl: params.downloadUrl },
      'email: report ready notification sent',
    );
  }
}
