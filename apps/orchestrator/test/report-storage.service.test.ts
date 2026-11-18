import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ReportStorageService,
  REPORT_RETENTION_MS,
  SIGNED_URL_TTL_MS,
} from '../src/modules/reports/report-storage.service.js';
import type { Env } from '../src/config/env.js';

describe('ReportStorageService', () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.useRealTimers();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  it('writes and replaces a PDF with matching integrity and retention metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-test-'));
    dirs.push(dir);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17'));
    const service = new ReportStorageService({
      REPORTS_STORAGE_DIR: dir,
      REPORTS_PUBLIC_URL: 'https://cdn.example',
    } as unknown as Env);
    for (const pdf of [Buffer.from('%PDF-first'), Buffer.from('%PDF-second')]) {
      const result = service.upload('report-id', pdf);
      expect(readFileSync(join(dir, 'report-id/report.pdf'))).toEqual(pdf);
      expect(result).toMatchObject({
        storageKey: 'reports/report-id.pdf',
        sha256: createHash('sha256').update(pdf).digest('hex'),
        sizeBytes: pdf.length,
        expiresAt: new Date(Date.now() + REPORT_RETENTION_MS),
      });
      const url = new URL(result.downloadUrl);
      expect(url.origin).toBe('https://cdn.example');
      expect(url.searchParams.get('expires')).toBe(
        new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString(),
      );
      expect(url.searchParams.get('token')).toMatch(/^[\da-f-]{36}$/);
    }
  });
  it('points the local signed URL at the app download route instead of a placeholder host', () => {
    const service = new ReportStorageService({} as Env);
    const url = new URL(service.signedUrl('reports/id.pdf'), 'http://localhost:3000');
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/api/v1/report/pdf/id/download');
    expect(url.searchParams.get('token')).toMatch(/^[\da-f-]{36}$/);
    expect(url.searchParams.get('expires')).toBeTruthy();
  });

  it('reads back a stored PDF by storage key and returns null for invalid or missing keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-test-'));
    dirs.push(dir);
    const service = new ReportStorageService({ REPORTS_STORAGE_DIR: dir } as unknown as Env);
    const pdf = Buffer.from('%PDF-1.4 local report');
    service.upload('read-id', pdf);
    expect(service.read('reports/read-id.pdf')).toEqual(pdf);
    expect(service.read('reports/missing.pdf')).toBeNull();
    expect(service.read('../../etc/passwd')).toBeNull();
    expect(service.read('reports/read-id.txt')).toBeNull();
  });
  it('ignores invalid and absent cleanup keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-test-'));
    dirs.push(dir);
    const service = new ReportStorageService({ REPORTS_STORAGE_DIR: dir } as unknown as Env);
    expect(() => service.delete('invalid')).not.toThrow();
    expect(() => service.delete('reports/absent.pdf')).not.toThrow();
  });
});
