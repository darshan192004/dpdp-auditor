import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
