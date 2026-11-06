import { describe, expect, it } from 'vitest';
import { VERSION } from '@dpdpa/contracts';

describe('@dpdpa/contracts package entry', () => {
  it('is importable by package name and exposes VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
