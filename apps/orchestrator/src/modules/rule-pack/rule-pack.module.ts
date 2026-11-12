import { Module } from '@nestjs/common';
import { RulePackService } from './rule-pack.service.js';

@Module({
  providers: [RulePackService],
  exports: [RulePackService],
})
export class RulePackModule {}
