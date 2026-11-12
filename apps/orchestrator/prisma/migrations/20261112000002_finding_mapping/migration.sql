-- P4-06 / P4-10: persist mapped findings, scoring inputs, and the coverage flag.
--
-- `control_code` is the rule-pack control the finding maps to (rules.md §7.2).
-- It is stored alongside the `dpdpa_rule_id` foreign key so the findings list
-- can be served and filtered even if the control table is mid-sync.
--
-- `facts` keeps the runner's repository facts so a later rescore (P4-24) uses
-- the same applicability inputs instead of guessing them.
--
-- `coverage_status` is `full` or `partial`; rules.md §9.5 withholds the grade on
-- a partial scan while still reporting the provisional score.

ALTER TABLE scans ADD COLUMN coverage_status text;
ALTER TABLE scans ADD COLUMN facts jsonb NOT NULL DEFAULT '{}';

ALTER TABLE scanner_findings ADD COLUMN control_code text;

CREATE INDEX idx_findings_scan_control ON scanner_findings (scan_id, control_code);
