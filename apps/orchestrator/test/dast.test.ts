// DAST baseline scan placeholder test for P6-05
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Basic validation that the OWASP ZAP configuration file exists and contains
 * the expected minimal keys. In a real environment this test would invoke
 * ZAP, but for CI we keep it lightweight and deterministic.
 */

describe('OWASP ZAP baseline configuration', () => {
  it('should be a valid JSON with required fields', () => {
    const cfgPath = resolve(__dirname, '../../..', 'docs', 'OWASP-ZAP-configuration.json');
    const raw = readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    // Required top‑level keys
    const required = ['targetUrl', 'auth', 'scanPolicyName'];
    for (const key of required) {
      expect(cfg).toHaveProperty(key);
    }
    // auth.type should be a string (e.g., "none" or "basic")
    expect(typeof cfg.auth?.type).toBe('string');
    // scanPolicyName should be non‑empty
    expect(cfg.scanPolicyName).toBeTruthy();
  });
});
