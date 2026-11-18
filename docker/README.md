# Container images (tasks.md P1-34)

`docker/web.Dockerfile`, `docker/orchestrator.Dockerfile` and
`docker/scan-runner.Dockerfile` are built by `.github/workflows/images.yml` on
every PR touching `apps/`, `packages/`,
`docker/`, or the workspace manifests.

Pipeline per image:

1. **Version parity** — `scripts/check_versions.py` checks the scan runner's
   Dockerfile ARGs, `versions.py` and the rule-pack catalogue before the build.
2. **Build** — Node images use a multi-stage pnpm/turbo build; the scan runner
   installs pinned Python scanners and a checksum-verified gitleaks binary.
3. **Smoke test** — Node images evaluate a trivial expression; the scan runner
   runs `smoke-scan-runner`, which checks all four pinned binaries and `git`.
4. **Trivy** — fails on fixable CRITICAL vulnerabilities.
5. **SBOM** — CycloneDX JSON attached as a workflow artifact.
6. **Cosign** — on `main` only, the pushed GHCR digest is signed keyless
   (Sigstore OIDC); admission control verifies the signature (P6-10).

Runtime bases are digest-pinned. Node images use distroless `nonroot`; the scan
runner uses `python:3.12` with UID 10001 because it needs `git` for shallow
clone. Bump base digests with Renovate.

## Local scan runner build

```sh
docker build -f docker/scan-runner.Dockerfile -t dpdpa/scan-runner:local .
docker run --rm dpdpa/scan-runner:local smoke-scan-runner
```

## Renderer

The renderer service is created in P5-17 (`apps/renderer`). Until then there is
no source tree to build, so the matrix has no renderer entry; add it here and in
`.github/workflows/images.yml` when P5-17 lands.
