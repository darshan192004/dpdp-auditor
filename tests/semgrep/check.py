"""Run with Semgrep 1.95.0 on PATH: python3 tests/semgrep/check.py."""

import json
import re
import subprocess
from pathlib import Path

fixtures = Path(__file__).resolve().parent
configs = [
    fixtures.parents[1] / "packages/rule-packs/semgrep/dpdpa.yaml",
    fixtures.parents[1] / "packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml",
]
targets = sorted(fixtures.glob("dpdpa.*"))
expected = set()
rules = set()
for target in targets:
    lines = target.read_text().splitlines()
    for number, line in enumerate(lines, start=1):
        annotation = re.search(r"(ruleid|ok): (dpdpa\.[\w.-]+)", line)
        if annotation:
            kind, rule = annotation.groups()
            rules.add(rule)
            if kind == "ruleid":
                while not lines[number].strip():
                    number += 1
                expected.add((target.name, number + 1, rule))

command = [
    "semgrep",
    "scan",
    "--metrics=off",
    "--no-rewrite-rule-ids",
    "--json",
    "--quiet",
]
for config in configs:
    command += ["--config", str(config)]
command += [str(target) for target in targets]
result = subprocess.check_output(command, text=True)
scan = json.loads(result)
if scan["errors"]:
    raise SystemExit(scan["errors"])
if {Path(path).resolve() for path in scan["paths"]["scanned"]} != set(targets):
    raise SystemExit("Semgrep did not scan every fixture")
actual = {
    (Path(match["path"]).name, match["start"]["line"], match["check_id"])
    for match in scan["results"]
    if match["check_id"] in rules
}
if actual != expected:
    raise SystemExit(f"Missing: {sorted(expected - actual)}\nUnexpected: {sorted(actual - expected)}")
print(f"Semgrep fixtures passed ({len(targets)} files, {len(rules)} rules)")
