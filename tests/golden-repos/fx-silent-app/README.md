# fx-silent-app

Fixture-only repository used to prove that a clean scanner run produces
`UNKNOWN` controls, `score: null`, and no letter grade under scoring v2.

This fixture is a unit/acceptance test input. It is not pilot evidence and must
never be presented as a real repository assessment.

## Canary scope

`src/silent.py` carries a unique canary marker in a comment. The automated
exit-gate test reads that marker from the fixture source and checks only the
in-memory serialized strings it produces here: evaluation `controlResults`,
scoring result, detector statuses, findings (empty and synthetic), and manifest
serialization. A boolean assertion is used so a failure cannot print or persist
the marker.

This offline assertion does **not** prove that the marker is absent from
databases, object storage, log sinks, callbacks, or HTTP API responses. Those
surfaces require the manual/pipeline gate on a real scan and remain
approval-gated; they are not exercised by CI and were not run as part of this
task.

## Manual smoke gate (not CI, approval required)

The WebGoat smoke gate is strictly manual. It is documented only in the Phase A
plan and requires explicit user approval before any scan starts; no CI test
scans WebGoat or a Juice-Shop-like repository.
