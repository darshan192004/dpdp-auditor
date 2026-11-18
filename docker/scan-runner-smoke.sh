#!/bin/sh
# Smoke test for docker/scan-runner.Dockerfile.
#
# Verifies that the image contains the pinned scanner binaries, git (used for
# shallow clone) and the installed run-scan console script. Version strings are
# checked with `case` rather than grep so the script works on a minimal base.
set -eu

expect_version() {
  name=$1
  expected=$2
  shift 2

  actual=$("$@" 2>&1 | tr '\n' ' ')
  case "$actual" in
    *"$expected"*) ;;
    *)
      echo "$name: expected $expected, got: $actual" >&2
      exit 1
      ;;
  esac
  echo "$name $expected ok"
}

git --version
expect_version semgrep 1.95.0 semgrep --version
expect_version checkov 3.2.0 checkov --version
expect_version gitleaks 8.21.0 gitleaks version
command -v run-scan >/dev/null
echo "scan runner image ok"
