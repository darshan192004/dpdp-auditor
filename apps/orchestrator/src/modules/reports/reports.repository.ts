import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The view model needs the scan, its repository, and the organisation branding. */
  findById(orgId: string, reportId: string) {
    return this.prisma.report.findFirst({
      where: { id: reportId, orgId },
      include: {
        scan: { include: { repository: true } },
        organization: true,
      },
    });
  }
}
