import { Module } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { ApiKeyGuard, ApiKeyScopesGuard } from './api-key-auth.guard.js';
import { ApiKeysRepository } from './api-keys.repository.js';
import { ApiKeysService } from './api-keys.service.js';
import { InternalApiKeysController } from './internal-api-keys.controller.js';

@Module({
  imports: [InternalAuthModule],
  controllers: [InternalApiKeysController],
  providers: [ApiKeysService, ApiKeysRepository, ApiKeyGuard, ApiKeyScopesGuard],
  exports: [ApiKeysService, ApiKeysRepository, ApiKeyGuard, ApiKeyScopesGuard],
})
export class ApiKeysModule {}
