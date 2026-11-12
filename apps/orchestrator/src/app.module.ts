import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { loadEnv, type Env } from './config/env.js';
import { ApiKeysModule } from './modules/api-keys/api-keys.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { InvitesModule } from './modules/invites/invites.module.js';
import { ReposModule } from './modules/repos/repos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RetentionModule } from './modules/retention/retention.module.js';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module.js';

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
        FeatureFlagsModule,
        IdentityModule,
        ApiKeysModule,
        ReposModule,
        InvitesModule,
      ],
    };
  }
}
