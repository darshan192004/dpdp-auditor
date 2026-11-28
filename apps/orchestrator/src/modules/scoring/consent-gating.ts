// apps/orchestrator/src/modules/scoring/consent-gating.ts
import { inventoryFactSchema, type DetectorStatus, type InventoryFact } from '@dpdpa/contracts';

export interface ConsentGatingInput {
  facts: unknown;
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
}

const PII_TOKENS = new Set(['email', 'phone', 'aadhaar', 'pan', 'address', 'dob']);
const GATE_TOKEN = 'consent_gate';

function inventoryFrom(value: unknown): InventoryFact[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const parsed = inventoryFactSchema.array().safeParse(record.inventory ?? []);
  return parsed.success ? parsed.data : [];
}

export function computeConsentGatingRatio(input: ConsentGatingInput): number | null {
  if (input.detectorStatuses.form_scan !== 'completed') return null;
  if (input.detectorStatuses.cmp_scan !== 'completed') return null;

  const facts = inventoryFrom(input.facts);
  const surfaces = new Set<string>();
  const gates = new Set<string>();

  for (const item of facts) {
    if (item.key === 'form_scan') {
      for (const signal of item.signals) {
        if ((signal.kind === 'route' || signal.kind === 'field') && PII_TOKENS.has(signal.token)) {
          surfaces.add(signal.path);
        }
      }
    }
    if (item.key === 'cmp_scan' || item.key === 'mechanism_scan') {
      for (const signal of item.signals) {
        if (signal.token === GATE_TOKEN) gates.add(signal.path);
      }
    }
  }

  if (surfaces.size === 0) return null;
  let gated = 0;
  for (const path of surfaces) if (gates.has(path)) gated += 1;
  return Math.round((gated / surfaces.size) * 10000) / 10000;
}
