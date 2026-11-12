import { Injectable } from '@nestjs/common';
import type { Organization, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateOrganizationRecord {
  name: string;
  slug: string;
}

export interface UpdateOrganizationRecord {
  name?: string;
  retentionDays?: number;
  settings?: Prisma.InputJsonValue;
}

/** Data access for `organizations` (database.md §4.1). */
@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateOrganizationRecord, tx?: Prisma.TransactionClient): Promise<Organization> {
    return this.client(tx).organization.create({
      data: { name: input.name, slug: input.slug },
    });
  }

  findById(id: string, tx?: Prisma.TransactionClient): Promise<Organization | null> {
    return this.client(tx).organization.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findBySlug(slug: string, tx?: Prisma.TransactionClient): Promise<Organization | null> {
    return this.client(tx).organization.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  update(
    id: string,
    input: UpdateOrganizationRecord,
    tx?: Prisma.TransactionClient,
  ): Promise<Organization> {
    return this.client(tx).organization.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.retentionDays === undefined ? {} : { retentionDays: input.retentionDays }),
        ...(input.settings === undefined ? {} : { settings: input.settings }),
      },
    });
  }

  softDelete(id: string, tx?: Prisma.TransactionClient): Promise<Organization> {
    return this.client(tx).organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}
