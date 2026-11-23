-- Advisory controls (scored: false) are part of the signed rule pack and are
-- materialised into dpdpa_rules so findings can reference them and the UI can
-- list them. They carry weight 0 and are excluded by the scoring engine.
-- The rule-pack schema accepts weight >= 0, so the database constraint must
-- match; the original `weight > 0` rejected the pack during scan completion.
ALTER TABLE "dpdpa_rules" DROP CONSTRAINT "dpdpa_rules_weight_check";
ALTER TABLE "dpdpa_rules" ADD CONSTRAINT "dpdpa_rules_weight_check" CHECK (weight >= 0);
