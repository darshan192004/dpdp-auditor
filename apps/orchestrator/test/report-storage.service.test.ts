import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  function make() {
    const dir = mkdtempSync(join(tmpdir(), 'report-test-'));
    dirs.push(dir);
    return {
      dir,
      service: new ReportStorageService({
        REPORTS_STORAGE_DIR: dir,
        ORCHESTRATOR_HMAC_KEY: 'test-signing-key'.repeat(3),
      } as Env),
    };
  }
  function read(service: ReportStorageService, key: string, url: URL) {
    return service.read(
      key,
      url.searchParams.get('token') ?? undefined,
      url.searchParams.get('expires') ?? undefined,
    );
  }
  afterEach(() => {
    vi.useRealTimers();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  it('writes and replaces a PDF with matching integrity and retention metadata', () => {
    const { dir, service } = make();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17'));
    for (const pdf of [Buffer.from('%PDF-first'), Buffer.from('%PDF-second')]) {
      const result = service.upload('report-id', pdf);
      expect(readFileSync(join(dir, 'report-id/report.pdf'))).toEqual(pdf);
      expect(result).toMatchObject({
        storageKey: 'reports/report-id.pdf',
        sha256: createHash('sha256').update(pdf).digest('hex'),
        sizeBytes: pdf.length,
        expiresAt: new Date(Date.now() + REPORT_RETENTION_MS),
      });
      const url = new URL(result.downloadUrl, 'https://app.example');
      expect(url.pathname).toBe('/api/v1/report/pdf/report-id/content');
      expect(url.searchParams.get('expires')).toBe(String(Date.now() + SIGNED_URL_TTL_MS));
      expect(url.searchParams.get('token')).toMatch(/^[a-f0-9]{64}$/);
      expect(read(service, result.storageKey, url)).toEqual(pdf);
    }
  });
  it('rejects tampering with the file, signature, and expiry, and expires grants at their deadline', () => {
    const { service } = make();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17'));
    const result = service.upload('report-id', Buffer.from('%PDF-content'));
    const url = new URL(result.downloadUrl, 'https://app.example');
    expect(() => read(service, 'reports/other-id.pdf', url)).toThrow(
      'Invalid report download link',
    );
    const tampered = new URL(url);
    tampered.searchParams.set('token', '0'.repeat(64));
    expect(() => read(service, result.storageKey, tampered)).toThrow(
      'Invalid report download link',
    );
    tampered.searchParams.set('expires', String(Date.now() + SIGNED_URL_TTL_MS + 1));
    expect(() => read(service, result.storageKey, tampered)).toThrow('expired');
    vi.advanceTimersByTime(SIGNED_URL_TTL_MS);
    expect(() => read(service, result.storageKey, url)).toThrow('expired');
  });
  it('deletes the expired file and its directory and ignores absent keys', () => {
    const { dir, service } = make();
    const result = service.upload('report-id', Buffer.from('%PDF-content'));
    service.delete(result.storageKey);
    expect(existsSync(join(dir, 'report-id'))).toBe(false);
    expect(() => service.delete(result.storageKey)).not.toThrow();
    const url = new URL(result.downloadUrl, 'https://app.example');
    expect(() => read(service, result.storageKey, url)).toThrow('does not exist');
  });
  it('rejects path traversal and malformed grants without reading outside storage', () => {
    const { service } = make();
    for (const key of [
      'invalid',
      'reports/../secret.pdf',
      'reports/../../secret.pdf',
      'reports/..%2fsecret.pdf',
    ]) {
      expect(() => service.signedUrl(key)).toThrow('Invalid report storage key');
      expect(() => service.delete(key)).not.toThrow();
    }
    expect(() => service.upload('../secret', Buffer.from('bad'))).toThrow(
      'Invalid report storage key',
    );
    expect(() => service.read('reports/id.pdf', undefined, undefined)).toThrow(
      'Invalid report download link',
    );
    expect(() => service.read('reports/id.pdf', 'not-hex', 'NaN')).toThrow(
      'Invalid report download link',
    );
  });
});
