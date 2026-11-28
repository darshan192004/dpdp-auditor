import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import type { ExportInput } from './export.schemas.js';
import { buildIssueMarkdown } from './markdown.service.js';
import { buildSarif } from './sarif.service.js';

@Controller('internal/v1/scans')
@UseGuards(InternalHmacGuard)
export class InternalExportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':scanId/export/sarif')
  async sarif(@Headers('x-org-id') orgHeader: string | undefined, @Param('scanId') scanId: string) {
    return { data: buildSarif(await this.input(orgHeader, scanId)) };
  }

  @Get(':scanId/export/markdown')
  async markdown(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
  ) {
    return { data: { markdown: buildIssueMarkdown(await this.input(orgHeader, scanId)) } };
  }

  private async input(orgHeader: string | undefined, scanId: string): Promise<ExportInput> {
    if (!orgHeader) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, orgId: orgHeader },
      include: { repository: true },
    });
    if (!scan) throw new ApiError('NOT_FOUND', 'The scan does not exist.');
    const rows = await this.prisma.controlResult.findMany({
      where: { scanId, orgId: orgHeader },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, remediationGuidance: true } } },
    });
    return {
      scanId,
      repository: scan.repository.fullName,
      rulePackVersion: scan.rulePackVersion,
      scoringVersion: scan.scoringVersion,
      results: rows.map((row) => ({
        controlCode: row.controlCode,
        section: row.rule.section,
        verdict: row.verdict,
        reasonCode: row.reasonCode,
        remediation: row.rule.remediationGuidance,
        evidence: row.evidence as ExportInput['results'][number]['evidence'],
      })),
    };
  }
}
