# DPDPA scan runner

Ephemeral scanner process used by the orchestrator. It clones a repository,
runs the pinned Semgrep, Checkov and Gitleaks binaries, normalises their
findings, posts signed batches to the orchestrator and sends a signed completion
callback.

## Configuration

| Variable            | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `SCAN_ID`           | Scan UUID used in callback URLs              |
| `REPO_URL`          | Repository URL to scan                       |
| `REPO_REF`          | Git ref to check out                         |
| `WORKSPACE`         | Temporary checkout directory                 |
| `PROFILE`           | Rule-pack profile (`standard` by default)    |
| `ORCHESTRATOR_URL`  | Internal orchestrator base URL               |
| `ORG_ID`            | Organisation ID sent in signed callbacks     |
| `INTERNAL_KEY`      | Shared key for internal route authentication |
| `CALLBACK_HMAC_KEY` | Secret used to sign callback bodies          |

Scanner versions are pinned in `src/scan_runner/versions.py`. The container
image and CI parity check use the same pins.

## Local use

```sh
python -m pip install -e '.[dev]'
pytest
ruff check .
mypy src tests
run-scan --help
```

The container image is built with `docker/scan-runner.Dockerfile` and smoke
tested with `docker/scan-runner-smoke.sh`.
