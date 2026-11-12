import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';
import { ENV, type Env } from '../../config/env.js';
import { loadRulePack, type LoadedRulePack } from './rule-pack.loader.js';

/**
 * P4-02. The pack is loaded once and cached. `onModuleInit` awaits the load so
 * a missing, tampered, or unsigned-when-required pack stops the orchestrator
 * from starting rather than surfacing as a per-request failure.
 */
@Injectable()
export class RulePackService implements OnModuleInit {
  private cached: Promise<LoadedRulePack> | undefined;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  load(): Promise<LoadedRulePack> {
    this.cached ??= loadRulePack(this.dir(), { publicKeyPem: this.publicKey() });
    return this.cached;
  }

  private dir(): string {
    return this.env.RULE_PACK_DIR ?? resolve(process.cwd(), '../../packages/rule-packs');
  }

  private publicKey(): string | undefined {
    return this.env.RULE_PACK_PUBLIC_KEY?.replace(/\\n/g, '\n');
  }
}
