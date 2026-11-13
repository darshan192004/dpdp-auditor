import { describe, expect, it } from 'vitest';

import { noteMinimumFor, validateTriage } from '../shared/triage';

describe('noteMinimumFor (docs/api.md §4.2)', () => {
  it('requires 20 characters for accepted risk and 10 for a false positive', () => {
    expect(noteMinimumFor('accepted_risk')).toBe(20);
    expect(noteMinimumFor('false_positive')).toBe(10);
  });

  it('requires no note for the other dispositions', () => {
    expect(noteMinimumFor('open')).toBe(0);
    expect(noteMinimumFor('fixed')).toBe(0);
    expect(noteMinimumFor('reopened')).toBe(0);
  });
});

describe('validateTriage', () => {
  it('returns no errors for a valid accepted risk', () => {
    expect(
      validateTriage({
        status: 'accepted_risk',
        note: 'Risk accepted until the Q1 migration lands.',
      }),
    ).toEqual({});
  });

  it('reports the note requirement against the note field', () => {
    const errors = validateTriage({ status: 'accepted_risk', note: 'too short' });

    expect(errors.note).toMatch(/at least 20 characters/i);
  });

  it('trims the note before measuring it', () => {
    const errors = validateTriage({ status: 'false_positive', note: '   short    ' });

    expect(errors.note).toMatch(/at least 10 characters/i);
  });

  it('rejects a ticket link that is not HTTPS', () => {
    const errors = validateTriage({
      status: 'fixed',
      externalUrl: 'http://tracker.example.test/T-42',
    });

    expect(errors.externalUrl).toMatch(/https/i);
  });

  it('rejects a note longer than the API maximum', () => {
    const errors = validateTriage({ status: 'open', note: 'a'.repeat(2001) });

    expect(errors.note).toMatch(/2000/);
  });
});
