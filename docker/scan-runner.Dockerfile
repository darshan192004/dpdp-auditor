# Ephemeral scan runner image (tasks.md P3-01..P3-13).
#
# Scanner versions are the single source of truth in
# apps/scan-runner/src/scan_runner/versions.py. `scripts/check_versions.py`
# fails CI if these ARG pins, versions.py, or the rule-pack catalogue drift.
ARG PYTHON_IMAGE=python:3.12@sha256:5411fa1b302c43f510324381162b5f5d0d93b9ee2af538f09d944f0d290ee3cb

FROM golang:1.26-bookworm@sha256:dc40a13b61304647ed7e5d581d246b86413dfc29d63c6d018310feb93cd98fc0 AS gitleaks-build
ARG GITLEAKS_VERSION=8.21.0
RUN CGO_ENABLED=0 GOBIN=/out go install -trimpath \
      -ldflags="-s -w -X github.com/zricethezav/gitleaks/v8/cmd.Version=${GITLEAKS_VERSION}" \
      github.com/zricethezav/gitleaks/v8@v${GITLEAKS_VERSION}

FROM ${PYTHON_IMAGE} AS wheels

ARG SEMGREP_VERSION=1.95.0
ARG CHECKOV_VERSION=3.2.0

# Build any native dependencies with the compiler in the full Python image.
# Only wheels and the runtime programs belong in the deployed scanner.
COPY apps/scan-runner /src/scan-runner
RUN python -m pip wheel --no-cache-dir --wheel-dir=/wheels \
      setuptools==80.9.0 \
      semgrep==${SEMGREP_VERSION} \
      checkov==${CHECKOV_VERSION} \
      /src/scan-runner

FROM python:3.12-slim-trixie@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b AS runtime
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends git libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
# Semgrep 1.95.0 uses pkg_resources, supplied by the pinned setuptools wheel.
RUN --mount=type=bind,from=wheels,source=/wheels,target=/wheels \
    python -m pip install --no-index --find-links=/wheels \
      setuptools==80.9.0 semgrep checkov dpdpa-scan-runner

COPY --from=gitleaks-build /out/gitleaks /usr/local/bin/gitleaks
COPY docker/scan-runner-smoke.sh /usr/local/bin/smoke-scan-runner
RUN chmod 0755 /usr/local/bin/smoke-scan-runner

# The orchestrator mounts its ephemeral repo at /workspace and the runner
# deletes it on every exit path. Use a fixed non-root UID for admission policy.
RUN groupadd --gid 10001 runner \
 && useradd --uid 10001 --gid 10001 --home-dir /home/runner --shell /usr/sbin/nologin runner \
 && mkdir -p /workspace /home/runner \
 && chown -R 10001:10001 /workspace /home/runner

USER 10001:10001
WORKDIR /workspace
ENV HOME=/home/runner \
    WORKSPACE=/workspace \
    PROFILE=standard

CMD ["run-scan"]
