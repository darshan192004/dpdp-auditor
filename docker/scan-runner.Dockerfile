# Ephemeral scan runner image (tasks.md P3-01..P3-13).
#
# Scanner versions are the single source of truth in
# apps/scan-runner/src/scan_runner/versions.py. `scripts/check_versions.py`
# fails CI if these ARG pins, versions.py, or the rule-pack catalogue drift.
ARG PYTHON_IMAGE=python:3.12@sha256:5411fa1b302c43f510324381162b5f5d0d93b9ee2af538f09d944f0d290ee3cb

FROM ${PYTHON_IMAGE} AS runtime

ARG SEMGREP_VERSION=1.95.0
ARG CHECKOV_VERSION=3.2.0
ARG GITLEAKS_VERSION=8.21.0
ARG TARGETARCH

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Semgrep and Checkov are installed from PyPI at their pinned versions.
# setuptools is pinned because Semgrep 1.95.0 imports pkg_resources, which the
# Python 3.12 base image no longer installs by default. The gitleaks release
# archive is verified against the checksum published on the same GitHub release
# before extraction.
RUN python -m pip install --no-cache-dir \
      setuptools==80.9.0 \
      semgrep==${SEMGREP_VERSION} \
      checkov==${CHECKOV_VERSION}

RUN set -eu; \
    case "${TARGETARCH:-amd64}" in \
      amd64) GL_ARCH=x64; GL_SHA=6c3a240509647225997d31df06e872350e1c0fe2fb85d323ae29a9fef0012586 ;; \
      arm64) GL_ARCH=arm64; GL_SHA=bdc6c692158f01dddea956a1d63a1575ae6e2556d929850dbd4feb33cc604d49 ;; \
      *) echo "unsupported TARGETARCH ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/gitleaks.tar.gz \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GL_ARCH}.tar.gz"; \
    echo "${GL_SHA}  /tmp/gitleaks.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks; \
    chmod 0755 /usr/local/bin/gitleaks; \
    rm -f /tmp/gitleaks.tar.gz

COPY apps/scan-runner /src/scan-runner
RUN python -m pip install --no-cache-dir /src/scan-runner

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
