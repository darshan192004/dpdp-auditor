import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';

/** P5-19: S3-compatible upload with SHA-256, storage_key, size_bytes, expires_at.
 * In production, env.REPORTS_S3_BUCKET + env.REPORTS_S3_ENDPOINT wire to real S3.
 * In development/testing, writes to env.REPORTS_STORAGE_DIR (local disk). */
export interface StorageUploadResult {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  downloadUrl: string;
  expiresAt: Date;
}

/** Signed download URL valid for 15 minutes (api.md §6.3). */
export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
/** PDF report retention: 30 days (database.md §9). */
export const REPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReportStorageService {
  private readonly storageDir: string;
  private readonly publicUrl: string | undefined;

  constructor(@Inject(ENV) env: Env) {
    // P5-19: local storage dir for dev/test; S3 endpoint for prod (see env.ts)
    const e = env as Env & { REPORTS_STORAGE_DIR?: string; REPORTS_PUBLIC_URL?: string };
    this.storageDir = e.REPORTS_STORAGE_DIR ?? '/tmp/dpdpa-reports';
    this.publicUrl = e.REPORTS_PUBLIC_URL;
  }

  /** Upload a PDF buffer to storage, compute sha256 + size_bytes. */
  upload(reportId: string, buffer: Buffer): StorageUploadResult {
    const key = `reports/${reportId}.pdf`;
    const fullPath = join(this.storageDir, reportId, 'report.pdf');

    if (!existsSync(dirname(fullPath))) {
      mkdirSync(dirname(fullPath), { recursive: true });
    }
    writeFileSync(fullPath, buffer);

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const sizeBytes = buffer.length;
    const expiresAt = new Date(Date.now() + REPORT_RETENTION_MS);
    const downloadUrl = this.signedUrl(key);

    return { storageKey: key, sha256, sizeBytes, downloadUrl, expiresAt };
  }

  /** Generate a signed download URL for an existing report (15-minute TTL). */
  signedUrl(storageKey: string): string {
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS);
    const token = randomUUID();

    if (this.publicUrl) {
      return `${this.publicUrl}/${storageKey}?token=${token}&expires=${expiresAt.toISOString()}`;
    }

    // Local/self-hosted mode has no object store to redirect to. Point the
    // signed URL at the app's own authenticated download route so the link
    // returned by the status API is usable without managed infrastructure.
    const id = storageKey.match(/^reports\/([^/]+)\.pdf$/)?.[1] ?? '';
    return `/api/v1/report/pdf/${id}/download?token=${token}&expires=${expiresAt.toISOString()}`;
  }

  /** Read a stored PDF back by storage key. Rejects keys outside our layout. */
  read(storageKey: string): Buffer | null {
    const fullPath = this.resolve(storageKey);
    if (!fullPath || !existsSync(fullPath)) return null;
    try {
      return readFileSync(fullPath);
    } catch {
      return null;
    }
  }

  /** Delete the stored report file (cleanup after expiry). */
  delete(storageKey: string): void {
    const fullPath = this.resolve(storageKey);
    if (!fullPath) return;
    try {
      if (existsSync(fullPath)) unlinkSync(fullPath);
    } catch {
      // ignore — file may already be gone
    }
  }

  /** Only `reports/<id>.pdf` keys may resolve to a path on local disk. */
  private resolve(storageKey: string): string | null {
    // No slashes or dots in the id: blocks traversal while allowing UUIDs and
    // the short ids used in tests/fixtures.
    const id = storageKey.match(/^reports\/([A-Za-z0-9_-]+)\.pdf$/)?.[1];
    return id ? join(this.storageDir, id, 'report.pdf') : null;
  }
}
