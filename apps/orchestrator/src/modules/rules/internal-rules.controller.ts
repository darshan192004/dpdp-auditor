import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { RulesService } from './rules.service.js';

/** Internal rule API consumed by Nitro (docs/api.md §7.1). */
@Controller('internal/v1/rules')
@UseGuards(InternalHmacGuard)
export class InternalRulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  async list(@Query() query: Record<string, string | string[] | undefined>) {
    return this.rules.list({
      ...(first(query.section) === undefined ? {} : { section: first(query.section) }),
      ...(first(query.scanner) === undefined
        ? {}
        : { scanner: first(query.scanner) as 'semgrep' | 'checkov' | 'gitleaks' }),
      page: int(query.page, 1),
      pageSize: int(query.pageSize, 50),
    });
  }

  @Get(':code')
  async detail(@Param('code') code: string) {
    return { data: await this.rules.detail(code) };
  }
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function int(value: string | string[] | undefined, fallback: number): number {
  const parsed = Number.parseInt(first(value) ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
