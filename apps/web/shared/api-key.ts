/**
 * API key contract shared by the BFF handlers, the settings page, and their
 * tests (docs/api.md §7.5). Pure so validation rules can be unit-tested without
 * mounting a handler.
 */
export const API_KEY_SCOPES = ['scan:read', 'scan:write', 'report:read', 'repo:read'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreated {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
  /** Plaintext key, shown once at creation and never persisted. */
  key: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string | null;
}

export const API_KEY_NAME_MIN = 1;
export const API_KEY_NAME_MAX = 80;

/** Validation failure carrying the offending field for the error envelope. */
export class ApiKeyInputError extends Error {
  constructor(
    message: string,
    readonly path = 'body',
  ) {
    super(message);
    this.name = 'ApiKeyInputError';
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ApiKeyInputError('The request body must be a JSON object.');
  }
  return raw as Record<string, unknown>;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw new ApiKeyInputError('The name must be a string.', 'name');
  const name = value.trim();
  if (name.length < API_KEY_NAME_MIN || name.length > API_KEY_NAME_MAX) {
    throw new ApiKeyInputError(
      `The name must be between ${API_KEY_NAME_MIN} and ${API_KEY_NAME_MAX} characters.`,
      'name',
    );
  }
  return name;
}

function parseScopes(value: unknown): ApiKeyScope[] {
  if (!Array.isArray(value)) {
    throw new ApiKeyInputError('The scopes must be an array.', 'scopes');
  }
  if (value.length === 0) {
    throw new ApiKeyInputError('At least one scope is required.', 'scopes');
  }
  if (value.length > API_KEY_SCOPES.length) {
    throw new ApiKeyInputError('Too many scopes provided.', 'scopes');
  }
  const scopes = value.filter(
    (s): s is ApiKeyScope =>
      typeof s === 'string' && (API_KEY_SCOPES as readonly string[]).includes(s),
  );
  if (scopes.length !== value.length) {
    throw new ApiKeyInputError('One or more invalid scopes.', 'scopes');
  }
  const unique = [...new Set(scopes)];
  if (unique.length !== scopes.length) {
    throw new ApiKeyInputError('Duplicate scopes are not allowed.', 'scopes');
  }
  return scopes;
}

function parseExpiresAt(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ApiKeyInputError('The expiresAt must be an ISO 8601 date string.', 'expiresAt');
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new ApiKeyInputError('The expiresAt must be a valid ISO 8601 date.', 'expiresAt');
  }
  if (timestamp <= Date.now()) {
    throw new ApiKeyInputError('The expiresAt must be in the future.', 'expiresAt');
  }
  return value;
}

/** Mirrors the orchestrator's `createApiKeySchema`. */
export function parseCreateApiKey(raw: unknown): CreateApiKeyInput {
  const record = asRecord(raw);
  const name = parseName(record.name);
  const scopes = parseScopes(record.scopes ?? ['scan:read']);
  const expiresAt = parseExpiresAt(record.expiresAt);
  return { name, scopes, expiresAt };
}
