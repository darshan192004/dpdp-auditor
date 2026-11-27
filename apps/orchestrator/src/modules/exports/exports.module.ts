import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { InternalExportsController } from './internal-exports.controller.js';

@Module({
  imports: [PrismaModule, InternalAuthModule],
  controllers: [InternalExportsController],
})
export class ExportsModule {}
