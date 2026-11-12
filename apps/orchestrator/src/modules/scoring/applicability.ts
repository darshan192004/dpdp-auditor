import type { Predicate } from '../rule-pack/rule-pack.schemas.js';

export interface RepoFacts {
  languages?: readonly string[] | undefined;
  frameworks?: readonly string[] | undefined;
  resourceTypes?: readonly string[] | undefined;
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
