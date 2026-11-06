import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import eslintConfig from '../eslint.config.cjs';
import { tsBase } from '../src/index';

const REQUIRED_FLAGS = [
  'strict',
  'noUncheckedIndexedAccess',
  'exactOptionalPropertyTypes',
] as const;

describe('tsBase preset', () => {
  it('enables strict, noUncheckedIndexedAccess, and exactOptionalPropertyTypes', () => {
    expect(tsBase.compilerOptions.strict).toBe(true);
    expect(tsBase.compilerOptions.noUncheckedIndexedAccess).toBe(true);
    expect(tsBase.compilerOptions.exactOptionalPropertyTypes).toBe(true);
  });

  it('keeps the root tsconfig.base.json in sync with tsBase', () => {
    const rootBase = JSON.parse(
      readFileSync(resolve(process.cwd(), '../../tsconfig.base.json'), 'utf8'),
    ) as { compilerOptions: Record<string, unknown> };

    for (const flag of REQUIRED_FLAGS) {
      expect(rootBase.compilerOptions[flag]).toBe(true);
    }
  });
});

describe('eslintConfig preset', () => {
  it('is a non-empty flat config array', () => {
    expect(Array.isArray(eslintConfig)).toBe(true);
    expect(eslintConfig.length).toBeGreaterThan(0);
  });
});
