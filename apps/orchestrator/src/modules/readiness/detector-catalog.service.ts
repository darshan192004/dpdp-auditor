import { Injectable } from '@nestjs/common';
import { RulePackService } from '../rule-pack/rule-pack.service.js';

/** Bounded, source-free explanation of each detector and its absence rules. */
@Injectable()
export class DetectorCatalogService {
  constructor(private readonly pack: RulePackService) {}

  async list() {
    const loaded = await this.pack.loadV2();
    return {
      pack: loaded.pack,
      detectors: loaded.detectors.map((detector) => ({
        id: detector.id,
        module: detector.module,
        inputs: detector.inputs,
        outputs: detector.outputs,
        timeoutMs: detector.timeoutMs,
        confidence: detector.confidence,
        failureMode: detector.failureMode,
        controls: loaded.controls
          .filter((control) => detector.controlRefs.includes(control.code))
          .map((control) => ({
            code: control.code,
            evidenceMode: control.evidenceMode,
            absenceTokens: control.absenceRules.map((rule) => rule.token),
          })),
      })),
    };
  }
}
