import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { RulePackService } from '../rule-pack/rule-pack.service.js';
import type { Control, Mapping } from '../rule-pack/rule-pack.schemas.js';
import { listRulesSchema, type ListRulesInput } from '../findings/findings.schemas.js';

/** api.md §7.1. The signed pack is the source of truth for the rule explorer. */
@Injectable()
export class RulesService {
  constructor(private readonly pack: RulePackService) {}

  async list(raw: ListRulesInput) {
    const input = listRulesSchema.parse(raw);
    const loaded = await this.pack.load();
    const controls = loaded.controls
      .filter((control) => input.section === undefined || control.section === input.section)
      .filter(
        (control) =>
          input.scanner === undefined ||
          loaded.mappings.some(
            (mapping) => mapping.controlCode === control.code && mapping.scanner === input.scanner,
          ),
      );
    const start = (input.page - 1) * input.pageSize;
    return {
      data: controls
        .slice(start, start + input.pageSize)
        .map((control) => toRuleView(control, mappingsFor(loaded.mappings, control.code))),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: controls.length,
        totalPages: Math.max(1, Math.ceil(controls.length / input.pageSize)),
      },
    };
  }

  async detail(code: string) {
    const loaded = await this.pack.load();
    const control = loaded.controlsByCode.get(code);
    if (!control) throw new ApiError('NOT_FOUND', 'The control does not exist.');
    return toRuleView(control, mappingsFor(loaded.mappings, control.code));
  }
}

export function toRuleView(control: Control, mappings: readonly Mapping[]) {
  return {
    code: control.code,
    section: control.section,
    title: control.title,
    summary: control.summary,
    obligation: control.obligation,
    legalReference: control.legalReference,
    severity: control.severity,
    weight: control.weight,
    scored: control.scored,
    evidenceStrength: control.evidenceStrength,
    tags: control.tags,
    mappings: mappings.map((mapping) => ({
      scanner: mapping.scanner,
      ruleId: mapping.ruleId,
      confidence: mapping.confidence,
      rationale: mapping.rationale,
    })),
    remediation: control.remediation,
  };
}

function mappingsFor(mappings: readonly Mapping[], code: string): Mapping[] {
  return mappings.filter((mapping) => mapping.controlCode === code);
}
