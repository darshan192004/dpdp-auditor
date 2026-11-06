import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { budgetsSchema } from '../src/budgets';

const REPO_BUDGETS_PATH = resolve(__dirname, '../../../budgets.json');
const REAL_BUDGETS: unknown = JSON.parse(readFileSync(REPO_BUDGETS_PATH, 'utf8'));

const VALID_BUDGETS = {
  webAppGzipBytes: 180435,
  apiP95Ms: 400,
  scanP95Ms: 600000,
  pdfP95Ms: 10000,
};

type BudgetCase = { name: string; payload: unknown; valid: boolean };

const budgetCases: BudgetCase[] = [
  { name: 'the pinned budgets.json values', payload: VALID_BUDGETS, valid: true },
  {
    name: 'the lower bounds (1 byte / 1 ms)',
    payload: { webAppGzipBytes: 1, apiP95Ms: 1, scanP95Ms: 1, pdfP95Ms: 1 },
    valid: true,
  },
  {
    name: 'the upper bounds (1 MiB / 5 s / 1 h / 60 s)',
    payload: {
      webAppGzipBytes: 1048576,
      apiP95Ms: 5000,
      scanP95Ms: 3600000,
      pdfP95Ms: 60000,
    },
    valid: true,
  },
  {
    name: 'a missing key (pdfP95Ms)',
    payload: { webAppGzipBytes: 180435, apiP95Ms: 400, scanP95Ms: 600000 },
    valid: false,
  },
  { name: 'an unknown key', payload: { ...VALID_BUDGETS, telemetryBudget: 1 }, valid: false },
  { name: 'a non-integer value', payload: { ...VALID_BUDGETS, apiP95Ms: 400.5 }, valid: false },
  { name: 'a negative value', payload: { ...VALID_BUDGETS, scanP95Ms: -1 }, valid: false },
  { name: 'a zero value', payload: { ...VALID_BUDGETS, pdfP95Ms: 0 }, valid: false },
  {
    name: 'a bundle budget above 1 MiB',
    payload: { ...VALID_BUDGETS, webAppGzipBytes: 1048577 },
    valid: false,
  },
  {
    name: 'an API p95 budget above 5 s',
    payload: { ...VALID_BUDGETS, apiP95Ms: 5001 },
    valid: false,
  },
  {
    name: 'a scan p95 budget above 1 h',
    payload: { ...VALID_BUDGETS, scanP95Ms: 3600001 },
    valid: false,
  },
  {
    name: 'a PDF p95 budget above 60 s',
    payload: { ...VALID_BUDGETS, pdfP95Ms: 60001 },
    valid: false,
  },
];

describe('budgetsSchema', () => {
  for (const { name, payload, valid } of budgetCases) {
    it(`${valid ? 'accepts' : 'rejects'} ${name}`, () => {
      expect(budgetsSchema.safeParse(payload).success).toBe(valid);
    });
  }
});

describe('budgets.json', () => {
  it('parses with exactly the four pinned budget keys (P0-19)', () => {
    const parsed = budgetsSchema.parse(REAL_BUDGETS);
    expect(Object.keys(parsed).sort()).toEqual([
      'apiP95Ms',
      'pdfP95Ms',
      'scanP95Ms',
      'webAppGzipBytes',
    ]);
    expect(parsed).toEqual(VALID_BUDGETS);
  });
});
