import { Module } from '@nestjs/common';
import { InternalHmacGuard } from './internal-hmac.guard.js';

@Module({ providers: [InternalHmacGuard], exports: [InternalHmacGuard] })
export class InternalAuthModule {}
