import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { loadEnv, type Env } from './config/env.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RetentionModule } from './modules/retention/retention.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env = loadEnv()): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        PrismaModule,
        AuditModule,
        HealthModule,
        QueueModule,
        RetentionModule,
      ],
    };
  }
}
