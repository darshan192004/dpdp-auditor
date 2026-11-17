import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../src/modules/reports/email.service.js';
import { logger } from '../src/common/logger.js';
import type { Env } from '../src/config/env.js';

describe('notification logging stub', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([false, true])(
    'records report and scan notification context (SMTP configured: %s)',
    async (enabled) => {
      const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      const service = new EmailService((enabled ? { SMTP_HOST: 'smtp.example' } : {}) as Env);
      await service.sendReportReady({
        to: 'recipient@example.test',
        reportId: 'report',
        scanId: 'scan',
        downloadUrl: 'https://example.test/report',
      });
      expect(info).toHaveBeenLastCalledWith(
        expect.objectContaining({ reportId: 'report', to: 'recipient@example.test' }),
        expect.stringContaining(enabled ? 'notification sent' : 'SMTP not configured'),
      );
      await service.sendScanCompleted({ to: 'recipient@example.test', scanId: 'scan' });
      expect(info).toHaveBeenLastCalledWith(
        { to: 'recipient@example.test', scanId: 'scan' },
        expect.stringContaining(enabled ? 'completed sent' : 'SMTP not configured'),
      );
      await service.sendScanFailed({
        to: 'recipient@example.test',
        scanId: 'scan',
        reason: 'timeout',
      });
      expect(info).toHaveBeenLastCalledWith(
        { to: 'recipient@example.test', scanId: 'scan', reason: 'timeout' },
        expect.stringContaining(enabled ? 'failed sent' : 'SMTP not configured'),
      );
    },
  );
});
