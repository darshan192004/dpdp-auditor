# Container images (tasks.md P1-34)

`docker/web.Dockerfile` and `docker/orchestrator.Dockerfile` are built by
`.github/workflows/images.yml` on every PR touching `apps/`, `packages/`,
`docker/`, or the workspace manifests.

Pipeline per image:

1. **Build** — multi-stage pnpm/turbo build on `node:22-bookworm-slim`.
2. **Smoke test** — the built image starts Node.
3. **Trivy** — fails on fixable CRITICAL vulnerabilities.
4. **SBOM** — CycloneDX JSON attached as a workflow artifact.
5. **Cosign** — on `main` only, the pushed GHCR digest is signed keyless
   (Sigstore OIDC); admission control verifies the signature (P6-10).

Runtime bases are digest-pinned distroless Node 22 images running as
`nonroot`, per `security.md` §11. Bump base digests with Renovate.

## Renderer

The renderer service is created in P5-17 (`apps/renderer`). Until then there is
no source tree to build, so the matrix has no renderer entry; add it here and in
`.github/workflows/images.yml` when P5-17 lands.
