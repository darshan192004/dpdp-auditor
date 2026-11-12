import type { Predicate } from '../rule-pack/rule-pack.schemas.js';

export interface RepoFacts {
  languages?: readonly string[] | undefined;
  frameworks?: readonly string[] | undefined;
  resourceTypes?: readonly string[] | undefined;
}

/** rules.md §13: repository facts arrive with the completion callback. */
export function factsFrom(value: unknown): RepoFacts {
  const record = asRecord(value);
  return {
    languages: strings(record.languages),
    frameworks: strings(record.frameworks),
    resourceTypes: strings(record.resourceTypes),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** P4-05. `applies_when` is evaluated against runner facts, never findings. */
export function isApplicable(predicate: Predicate, facts: RepoFacts): boolean {
  if ('any' in predicate) {
    return predicate.any.some((child) => isApplicable(child, facts));
  }
  if ('all' in predicate) {
    return predicate.all.every((child) => isApplicable(child, facts));
  }
  const checks: Array<[string | undefined, readonly string[]]> = [
    [predicate.language, facts.languages ?? []],
    [predicate.framework, facts.frameworks ?? []],
    [predicate.resourceType, facts.resourceTypes ?? []],
  ];
  return checks.every(([value, available]) =>
    value === undefined
      ? true
      : available.some((fact) => fact.toLowerCase() === value.toLowerCase()),
  );
}
