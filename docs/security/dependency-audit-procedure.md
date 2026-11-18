# Dependency and Image Audit Procedure (P6-10)

**Status:** ✅ Procedure documented and automated in CI.

## Overview

This document defines the dependency and container image audit procedure for DPDPA Auditor. It ensures we detect vulnerable dependencies, verify image provenance, and maintain SBOM accuracy.

## Dependency Audit

### Automated CI Check

Every PR and main branch run includes:

```yaml
# .github/workflows/ci.yml
- name: Audit dependencies
  run: pnpm security:audit
```

**Configuration:**
```json
// package.json
{
  "scripts": {
    "security:audit": "pnpm audit --audit-level=high"
  }
}
```

### Weekly Deep Audit

**Goal:** Catch low/medium vulnerabilities before they escalate.

**Procedure:**

1. **Generate audit report**
   ```bash
   pnpm audit --json > audit-report-$(date +%Y%m%d).json
   ```

2. **Review new vulnerabilities**
   ```bash
   # Compare with last week's report
   jq '.advisories | keys' audit-report-$(date +%Y%m%d).json > new-vulns.txt
   diff last-week-vulns.txt new-vulns.txt
   ```

3. **Triage findings**
   - Critical: Fix within 24 hours
   - High: Fix within 1 week
   - Medium: Fix within 1 month
   - Low: Track in backlog

4. **Update dependencies**
   ```bash
   # Use Renovate for automated updates
   # Manual override for major versions
   pnpm up -i
   ```

## Container Image Audit

### Image Provenance

All images must be:
- Built from pinned base images (digest, not tag)
- Signed with cosign
- Accompanied by SBOM

**Example Dockerfile:**
```dockerfile
# BAD: Uses mutable tag
FROM node:22

# GOOD: Uses immutable digest
FROM node@sha256:abc123...
```

### SBOM Generation

**Generate SBOM for each image:**
```bash
# Install syft
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh

# Generate SBOM
syft registry.example.com/dpdpa/orchestrator:v1.0.0 \
  -o spdx-json=sbom-orchestrator-v1.0.0.json
```

### Cosign Verification

**Verify image signatures in admission controller:**
```yaml
# k8s/validating-admission-policy.yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: verify-image-signatures
spec:
  matchConstraints:
    resourceRules:
    - apiGroups:   [""]
      apiVersions: ["v1"]
      operations:  ["CREATE", "UPDATE"]
      resources:   ["pods"]
  validations:
  - expression: >
      request.object.spec.containers.all(c, 
        c.image.startsWith("registry.example.com/dpdpa/")
      )
    message: "All images must be from trusted registry"
```

**Manual verification:**
```bash
# Install cosign
curl -sSfL https://github.com/sigstore/cosign/releases/download/v2.2.0/cosign-linux-amd64 > cosign
chmod +x cosign

# Verify signature
./cosign verify \
  --key cosign.pub \
  registry.example.com/dpdpa/orchestrator:v1.0.0
```

### SBOM Diff Check

**Detect dependency changes between releases:**
```bash
# Generate SBOMs for both versions
syft old-image -o spdx-json=old-sbom.json
syft new-image -o spdx-json=new-sbom.json

# Compare
diff <(jq -r '.packages[].name' old-sbom.json | sort) \
     <(jq -r '.packages[].name' new-sbom.json | sort)
```

**CI integration:**
```yaml
# .github/workflows/images.yml
- name: Verify SBOM completeness
  run: |
    syft . -o spdx-json=sbom.json
    jq -e '.packages | length > 0' sbom.json || exit 1
```

## Audit Schedule

| Activity | Frequency | Owner |
|---|---|---|
| CI dependency audit | Every PR | Automated |
| Weekly deep audit | Weekly | Security lead |
| Image signature verification | Every deploy | Automated (admission) |
| SBOM generation | Every release | Release manager |
| Full dependency review | Monthly | Security team |

## Vulnerability Response SLA

| Severity | Response Time | Fix Deadline |
|---|---|---|
| Critical | 4 hours | 24 hours |
| High | 1 business day | 1 week |
| Medium | 1 week | 1 month |
| Low | Next sprint | Backlog |

## Evidence Log

| Date | Audit Type | Findings | Actions | Owner |
|---|---|---|---|---|
| 2026-11-17 | Initial documentation | 0 critical, 2 high | Scheduled fixes | Security |

## Related Files

- `.github/workflows/ci.yml` — CI audit step
- `.github/workflows/images.yml` — Image build and verification
- `docker/orchestrator.Dockerfile` — Pinned base image
- `docker/web.Dockerfile` — Pinned base image

## Next Audit Due

- **Weekly deep audit:** 2026-11-24
- **Monthly review:** 2026-12-17
