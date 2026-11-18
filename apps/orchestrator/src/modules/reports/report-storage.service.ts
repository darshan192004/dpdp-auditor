import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { ApiError } from '../../common/api-error.js';

export interface StorageUploadResult {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  downloadUrl: string;
  expiresAt: Date;
}

/** Authenticated download URL lifetime (api.md §6.3). */
export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
/** PDF report retention: 30 days (database.md §9). */
export const REPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Local storage: mount REPORTS_STORAGE_DIR on a volume shared by worker and API. */
@Injectable()
export class ReportStorageService {
  private readonly storageDir: string;
  private readonly signingKey: string;

  constructor(@Inject(ENV) env: Env) {
    this.storageDir = env.REPORTS_STORAGE_DIR ?? '/tmp/dpdpa-reports';
    this.signingKey = env.ORCHESTRATOR_HMAC_KEY;
  }

  upload(reportId: string, buffer: Buffer): StorageUploadResult {
    const key = `reports/${reportId}.pdf`;
    const fullPath = this.path(key);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, buffer);

    return {
      storageKey: key,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.length,
      downloadUrl: this.signedUrl(key),
      expiresAt: new Date(Date.now() + REPORT_RETENTION_MS),
    };
  }

  /** Same-origin URL; the content endpoint also requires a tenant session. */
  signedUrl(storageKey: string): string {
    const reportId = this.reportId(storageKey);
    const expires = String(Date.now() + SIGNED_URL_TTL_MS);
    return `/api/v1/report/pdf/${reportId}/content?${new URLSearchParams({
      expires,
      token: this.token(storageKey, expires),
    })}`;
  }

  read(storageKey: string, token: string | undefined, expires: string | undefined): Buffer {
    const fullPath = this.path(storageKey);
    if (!expires || !/^\d{13}$/.test(expires) || !token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new ApiError('FORBIDDEN', 'Invalid report download link.');
    }
    const deadline = Number(expires);
    if (deadline <= Date.now() || deadline > Date.now() + SIGNED_URL_TTL_MS) {
      throw new ApiError('REPORT_EXPIRED', 'The report download link has expired.');
    }
    if (
      !timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(this.token(storageKey, expires), 'hex'),
      )
    ) {
      throw new ApiError('FORBIDDEN', 'Invalid report download link.');
    }
    try {
      return readFileSync(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ApiError('NOT_FOUND', 'The report file does not exist.');
      }
      throw error;
    }
  }

  delete(storageKey: string): void {
    // A corrupt database key must never escape the report storage root.
    if (!/^reports\/[A-Za-z0-9_-]+\.pdf$/.test(storageKey)) return;
    const fullPath = this.path(storageKey);
    try {
      unlinkSync(fullPath);
      rmdirSync(dirname(fullPath));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
    }
  }

  private reportId(storageKey: string): string {
    const id = /^reports\/([A-Za-z0-9_-]+)\.pdf$/.exec(storageKey)?.[1];
    if (!id) throw new ApiError('NOT_FOUND', 'Invalid report storage key.');
    return id;
  }

  private path(storageKey: string): string {
    return join(this.storageDir, this.reportId(storageKey), 'report.pdf');
  }

  private token(storageKey: string, expires: string): string {
    return createHmac('sha256', this.signingKey)
      .update(`report-download:${storageKey}:${expires}`)
      .digest('hex');
  }
}
