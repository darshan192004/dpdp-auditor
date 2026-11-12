import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateUserInput {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  githubUserId?: bigint | null;
}

export interface UpdateUserProfileInput {
  email?: string;
  name?: string | null;
  avatarUrl?: string | null;
  githubUserId?: bigint | null;
  lastLoginAt?: Date;
  deletedAt?: Date | null;
}

/** Data access for the global `users` table (database.md §4.2). */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByGithubId(githubUserId: bigint, tx?: Prisma.TransactionClient): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { githubUserId } });
  }

  findByEmail(email: string, tx?: Prisma.TransactionClient): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { email } });
  }

  findById(id: string, tx?: Prisma.TransactionClient): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { id } });
  }

  create(input: CreateUserInput, tx?: Prisma.TransactionClient): Promise<User> {
    return this.client(tx).user.create({
      data: {
        email: input.email,
        name: input.name ?? null,
        avatarUrl: input.avatarUrl ?? null,
        githubUserId: input.githubUserId ?? null,
      },
    });
  }

  updateProfile(
    id: string,
    input: UpdateUserProfileInput,
    tx?: Prisma.TransactionClient,
  ): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: {
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
        ...(input.githubUserId === undefined ? {} : { githubUserId: input.githubUserId }),
        ...(input.lastLoginAt === undefined ? {} : { lastLoginAt: input.lastLoginAt }),
        ...(input.deletedAt === undefined ? {} : { deletedAt: input.deletedAt }),
      },
    });
  }

  softDelete(id: string, tx?: Prisma.TransactionClient): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}
