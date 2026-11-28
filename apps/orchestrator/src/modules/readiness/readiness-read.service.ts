import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface InventorySignalLike {
  detector: string;
  kind: string;
  path: string;
  line: number | null;
  token: string;
  count?: number | null;
}

@Injectable()
export class ReadinessReadService {
  constructor(private readonly prisma: PrismaService) {}

  async inventory(orgId: string, scanId: string) {
    const scan = await this.scan(orgId, scanId);
    const facts = scan.facts as {
      inventory?: { signals?: readonly InventorySignalLike[] };
    };
    const signals = (facts.inventory?.signals ?? []).map((signal) => ({
      detector: signal.detector,
      kind: signal.kind,
      path: signal.path,
      line: signal.line,
      token: signal.token,
      ...(signal.count === undefined ? {} : { count: signal.count }),
    }));
    return {
      version: scan.inventoryVersion,
      status: scan.inventoryStatus,
      consentGatingRatio:
        scan.consentGatingRatio === null ? null : Number(scan.consentGatingRatio.toString()),
      signals,
    };
  }

  async gaps(orgId: string, scanId: string) {
    await this.scan(orgId, scanId);
    const rows = await this.prisma.controlResult.findMany({
      where: {
        orgId,
        scanId,
        verdict: { in: ['FAIL', 'PARTIAL', 'ATTESTED_FAIL'] },
      },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, title: true, remediationGuidance: true } } },
    });
    return rows.map((row) => ({
      controlCode: row.controlCode,
      section: row.rule.section,
      title: row.rule.title,
      verdict: row.verdict,
      reasonCode: row.reasonCode,
      evidence: row.evidence as unknown[],
    }));
  }

  async fixPlan(orgId: string, scanId: string) {
    await this.scan(orgId, scanId);
    const rows = await this.prisma.controlResult.findMany({
      where: {
        orgId,
        scanId,
        verdict: { in: ['FAIL', 'PARTIAL', 'ATTESTED_FAIL'] },
      },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, title: true, remediationGuidance: true } } },
    });
    return {
      steps: rows.map((row) => ({
        controlCode: row.controlCode,
        section: row.rule.section,
        title: row.rule.title,
        remedy:
          row.verdict === 'ATTESTED_FAIL'
            ? 'Record a current attestation.'
            : row.rule.remediationGuidance,
      })),
    };
  }

  private async scan(orgId: string, scanId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, orgId },
      select: {
        inventoryVersion: true,
        inventoryStatus: true,
        consentGatingRatio: true,
        facts: true,
      },
    });
    if (scan === null) throw new ApiError('NOT_FOUND', 'The scan does not exist.');
    return scan;
  }
}
