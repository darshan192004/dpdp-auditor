"""DPDPA scan runner.

An ephemeral, single-repository process: validate configuration, clone once,
run the pinned scanners, normalise findings, stream them to the orchestrator
over an HMAC-signed callback, then delete the workspace.
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.1.0"
