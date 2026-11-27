# Phase F manual smoke gate

REQUIRES EXPLICIT APPROVAL. This checklist is never executed by CI and is not a pilot sign-off.

Fixtures under `tests/golden-repos/` are test inputs only and must never be presented as pilot evidence or sign-off data. WebGoat and a small Juice-Shop-like repository are manual smoke tests, not CI gates.

## Before running

1. Obtain explicit user approval for a live public-repository scan and for each destination URL.
2. Use an ephemeral workspace under `/tmp/opencode/` and delete it after the run.
3. Never log, persist, or callback raw scanner output; the signed callback allowlist in `apps/scan-runner/src/scan_runner/batches.py` is the only transport shape.

## Approved-run commands (do not execute without step 1)

```sh
cd apps/scan-runner
python -m pip install -e '.[dev]'
SCAN_ID=phase-f-webgoat ORCHESTRATOR_URL=http://orchestrator:3001 \
CALLBACK_HMAC_KEY="$CALLBACK_HMAC_KEY" INTERNAL_KEY="$INTERNAL_KEY" \
ORG_ID=org-local REPO_URL=https://github.com/WebGoat/WebGoat.git REPO_REF=main \
WORKSPACE=/tmp/opencode/phase-f-webgoat run-scan
python -m pytest tests/test_canary_containment.py -v
```

After the run, record only counts, verdicts, detector statuses, and the absence of the canary in DB/object storage/logs/callbacks/API. Do not claim a pilot sign-off or a legal conclusion, and do not issue any badge or attestation. Phase G live URL verification remains deferred pending a separate threat-model review.
