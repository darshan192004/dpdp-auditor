import { Module } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { RulePackModule } from '../rule-pack/rule-pack.module.js';
import { InternalRulesController } from './internal-rules.controller.js';
import { RulesService } from './rules.service.js';

@Module({
  imports: [RulePackModule, InternalAuthModule],
  controllers: [InternalRulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
