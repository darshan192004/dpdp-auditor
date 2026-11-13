import type { FindingStatus } from './findings';

/**
 * Triage rules from docs/api.md §4.2. Kept pure so the form, the fixture
 * provider, and the tests all apply the same minimums.
 */

export interface TriageDraft {
  status: FindingStatus;
  note?: string;
  externalUrl?: string;
}

export interface TriageErrors {
  note?: string;
  externalUrl?: string;
}

const MAX_NOTE_LENGTH = 2000;

/** A note is mandatory for the two dispositions that hide risk. */
export function noteMinimumFor(status: FindingStatus): number {
  if (status === 'accepted_risk') return 20;
  if (status === 'false_positive') return 10;
  return 0;
}

export function validateTriage(draft: TriageDraft): TriageErrors {
  const errors: TriageErrors = {};
  const note = (draft.note ?? '').trim();
  const minimum = noteMinimumFor(draft.status);

  if (note.length > MAX_NOTE_LENGTH) {
    errors.note = `A note can be at most ${MAX_NOTE_LENGTH} characters.`;
  } else if (note.length < minimum) {
    errors.note = `A note of at least ${minimum} characters is required.`;
  }

  const url = (draft.externalUrl ?? '').trim();
  if (url !== '' && !isHttpsUrl(url)) {
    errors.externalUrl = 'The ticket link must use HTTPS.';
  }

  return errors;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
