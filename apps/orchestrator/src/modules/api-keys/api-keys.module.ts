import { Module } from '@nestjs/common';
import { ApiKeyGuard, ApiKeyScopesGuard } from './api-key-auth.guard.js';
import { ApiKeysRepository } from './api-keys.repository.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  providers: [ApiKeysService, ApiKeysRepository, ApiKeyGuard, ApiKeyScopesGuard],
  exports: [ApiKeysService, ApiKeysRepository, ApiKeyGuard, ApiKeyScopesGuard],
})
export class ApiKeysModule {}
