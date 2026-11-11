import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  allowedFailureFraction,
  burnRateMultiplier,
  burnRateThreshold,
  parseSloPolicy,
  sloPolicySchema,
  type LatencySlo,
  type RatioSlo,
  type SloPolicy,
} from '../src/slo';

const SLO_PATH = resolve(__dirname, '../../../monitoring/slos.yaml');
const PROMETHEUS_RULES_PATH = resolve(__dirname, '../../../monitoring/prometheus/rules.yml');
const GRAFANA_ALERTS_PATH = resolve(
  __dirname,
  '../../../monitoring/grafana/provisioning/alerting/burn-rate.yml',
);

function readYaml(path: string): unknown {
  return parseYaml(readFileSync(path, 'utf8'));
}

const POLICY: SloPolicy = parseSloPolicy(readYaml(SLO_PATH));

function sloById(id: string) {
  const slo = POLICY.slos.find((candidate) => candidate.id === id);
  if (!slo) throw new Error(`missing SLO ${id}`);
  return slo;
}

type PromRule = {
  alert?: string;
  record?: string;
  expr?: string;
  labels?: Record<string, string>;
};
type PromRulesFile = { groups: { name: string; rules: PromRule[] }[] };

const PROM_RULES = readYaml(PROMETHEUS_RULES_PATH) as PromRulesFile;
const ALL_PROM_RULES = PROM_RULES.groups.flatMap((group) => group.rules);
const PROM_ALERTS = ALL_PROM_RULES.filter((rule) => rule.alert !== undefined);

describe('monitoring/slos.yaml', () => {
  it('parses with exactly the six SLOs from operations.md §1', () => {
    expect(POLICY.slos.map((slo) => slo.id)).toEqual([
      'web-api-availability',
      'scan-execution-availability',
      'scan-latency',
      'api-latency',
      'queue-wait',
      'pdf-render',
    ]);
  });

  it('pins the §1 targets and windows', () => {
    expect(sloById('web-api-availability')).toMatchObject({ kind: 'ratio', target: 0.995 });
    expect(sloById('scan-execution-availability')).toMatchObject({ kind: 'ratio', target: 0.99 });
    expect(sloById('scan-latency')).toMatchObject({
      kind: 'latency',
      percentile: 95,
      thresholdMs: 600_000,
      window: 'rolling_7d',
    });
    expect(sloById('api-latency')).toMatchObject({ percentile: 95, thresholdMs: 400 });
    expect(sloById('queue-wait')).toMatchObject({ percentile: 95, thresholdMs: 60_000 });
    expect(sloById('pdf-render')).toMatchObject({ percentile: 95, thresholdMs: 10_000 });
  });

  it('declares the three §1 exclusions and references only known ones', () => {
    expect(POLICY.exclusions.map((exclusion) => exclusion.id)).toEqual([
      'planned-maintenance',
      'customer-error',
      'waf-rate-limit',
    ]);
    const known = new Set(POLICY.exclusions.map((exclusion) => exclusion.id));
    for (const slo of POLICY.slos) {
      for (const id of slo.exclusions) expect(known.has(id)).toBe(true);
    }
  });
});

describe('burn-rate math', () => {
  it('derives 14.4× fast and 6× slow from the 2%/1h and 5%/6h policy', () => {
    expect(
      burnRateMultiplier(POLICY.errorBudget.fast, POLICY.errorBudget.sloWindowHours),
    ).toBeCloseTo(14.4);
    expect(
      burnRateMultiplier(POLICY.errorBudget.slow, POLICY.errorBudget.sloWindowHours),
    ).toBeCloseTo(6);
  });

  it('derives 0.072 / 0.144 fast and 0.03 / 0.06 slow thresholds', () => {
    const { fast, slow, sloWindowHours } = POLICY.errorBudget;
    const webApi = sloById('web-api-availability') as RatioSlo;
    const scanExecution = sloById('scan-execution-availability') as RatioSlo;

    expect(burnRateThreshold(webApi, fast, sloWindowHours)).toBeCloseTo(0.072);
    expect(burnRateThreshold(webApi, slow, sloWindowHours)).toBeCloseTo(0.03);
    expect(burnRateThreshold(scanExecution, fast, sloWindowHours)).toBeCloseTo(0.144);
    expect(burnRateThreshold(scanExecution, slow, sloWindowHours)).toBeCloseTo(0.06);
  });

  it('treats latency SLOs as a 5% breach budget', () => {
    const latency = sloById('scan-latency') as LatencySlo;
    expect(allowedFailureFraction(latency)).toBeCloseTo(0.05);
    expect(burnRateThreshold(latency, POLICY.errorBudget.fast, 720)).toBeCloseTo(0.72);
  });
});

describe('sloPolicySchema', () => {
  const valid = readYaml(SLO_PATH) as Record<string, unknown>;

  const clone = () =>
    structuredClone(valid) as {
      slos: Record<string, unknown>[];
      exclusions: { id: string }[];
      errorBudget: {
        fast: { windowHours: number };
        slow: { windowHours: number; budgetFraction: number };
      };
    };

  it('accepts the committed policy', () => {
    expect(sloPolicySchema.safeParse(valid).success).toBe(true);
  });

  const cases: { name: string; mutate: (doc: ReturnType<typeof clone>) => void }[] = [
    {
      name: 'an unknown top-level key',
      mutate: (doc) => Object.assign(doc, { telemetry: true }),
    },
    {
      name: 'a duplicate SLO id',
      mutate: (doc) => doc.slos.push(structuredClone(doc.slos[0]!)),
    },
    {
      name: 'an unknown exclusion reference',
      mutate: (doc) => {
        doc.slos[0]!.exclusions = ['nonexistent'];
      },
    },
    {
      name: 'a duplicate exclusion id',
      mutate: (doc) => doc.exclusions.push(structuredClone(doc.exclusions[0]!)),
    },
    {
      name: 'an availability target of 1',
      mutate: (doc) => {
        doc.slos[0]!.target = 1;
      },
    },
    {
      name: 'a percentile of 100',
      mutate: (doc) => {
        doc.slos[2]!.percentile = 100;
      },
    },
    {
      name: 'a slow window shorter than the fast window',
      mutate: (doc) => {
        doc.errorBudget.slow.windowHours = 0.5;
      },
    },
    {
      name: 'a slow burn below the fast burn',
      mutate: (doc) => {
        doc.errorBudget.slow.budgetFraction = 0.01;
      },
    },
  ];

  for (const { name, mutate } of cases) {
    it(`rejects ${name}`, () => {
      const doc = clone();
      mutate(doc);
      expect(sloPolicySchema.safeParse(doc).success).toBe(false);
    });
  }
});

describe('monitoring/prometheus/rules.yml', () => {
  it('has one fast and one slow burn alert per availability SLO', () => {
    const burnAlerts = PROM_ALERTS.filter((rule) => rule.alert === 'SloErrorBudgetBurnFast');
    expect(burnAlerts.map((rule) => rule.labels?.slo_id).sort()).toEqual([
      'scan-execution-availability',
      'web-api-availability',
    ]);
    const slowAlerts = PROM_ALERTS.filter((rule) => rule.alert === 'SloErrorBudgetBurnSlow');
    expect(slowAlerts.map((rule) => rule.labels?.slo_id).sort()).toEqual([
      'scan-execution-availability',
      'web-api-availability',
    ]);
  });

  it('embeds the computed thresholds in the alert expressions', () => {
    const { fast, slow, sloWindowHours } = POLICY.errorBudget;
    const expectations: [string, number, number][] = [
      ['web-api-availability', 0.072, 0.03],
      ['scan-execution-availability', 0.144, 0.06],
    ];

    for (const [id, fastThreshold, slowThreshold] of expectations) {
      const slo = sloById(id);
      expect(fastThreshold).toBeCloseTo(burnRateThreshold(slo, fast, sloWindowHours));
      expect(slowThreshold).toBeCloseTo(burnRateThreshold(slo, slow, sloWindowHours));

      const fastAlert = PROM_ALERTS.find(
        (rule) => rule.alert === 'SloErrorBudgetBurnFast' && rule.labels?.slo_id === id,
      );
      const slowAlert = PROM_ALERTS.find(
        (rule) => rule.alert === 'SloErrorBudgetBurnSlow' && rule.labels?.slo_id === id,
      );
      expect(fastAlert?.expr).toContain(`> ${fastThreshold}`);
      expect(slowAlert?.expr).toContain(`> ${slowThreshold}`);
    }
  });

  it('alerts on every latency SLO with the §4 severity and runbook', () => {
    const latencyAlerts = PROM_ALERTS.filter((rule) => rule.alert === 'SloLatencyBreach');
    expect(latencyAlerts.map((rule) => rule.labels?.slo_id).sort()).toEqual([
      'api-latency',
      'pdf-render',
      'queue-wait',
      'scan-latency',
    ]);
    for (const rule of latencyAlerts) {
      expect(rule.labels?.severity).toBe('P2');
      expect(rule.labels?.runbook).toMatch(/^runbooks\/[a-z-]+\.md$/);
    }
  });

  it('records the metrics the alerts read', () => {
    const recorded = new Set(ALL_PROM_RULES.map((rule) => rule.record));
    for (const name of [
      'slo:web_api_availability:error_ratio5m',
      'slo:web_api_availability:burn_rate1h',
      'slo:scan_execution_availability:error_ratio6h',
      'slo:scan_execution_availability:burn_rate30m',
      'slo:scan_latency:p95_seconds',
      'slo:api_latency:p95_seconds',
      'slo:queue_wait:p95_seconds',
      'slo:pdf_render:p95_seconds',
    ]) {
      expect(recorded.has(name)).toBe(true);
    }
  });
});

describe('monitoring/grafana/provisioning/alerting/burn-rate.yml', () => {
  const grafana = readYaml(GRAFANA_ALERTS_PATH) as {
    groups: {
      rules: { uid: string; labels: Record<string, string>; data: { datasourceUid: string }[] }[];
    }[];
  };
  const rules = grafana.groups.flatMap((group) => group.rules);

  it('mirrors the four Prometheus burn alerts', () => {
    expect(rules.map((rule) => rule.uid).sort()).toEqual([
      'slo-burn-scan-execution-fast',
      'slo-burn-scan-execution-slow',
      'slo-burn-web-api-fast',
      'slo-burn-web-api-slow',
    ]);
  });

  it('points at the provisioned Prometheus datasource and the SLO ids', () => {
    const sloIds = new Set(POLICY.slos.map((slo) => slo.id));
    for (const rule of rules) {
      expect(rule.data.every((node) => node.datasourceUid === 'prometheus')).toBe(true);
      expect(sloIds.has(rule.labels.slo_id ?? '')).toBe(true);
      expect(rule.labels.severity).toMatch(/^P[12]$/);
    }
  });
});
