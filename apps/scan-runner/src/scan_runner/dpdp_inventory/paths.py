"""Deterministic, bounded file walking for inventory detectors."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Final

SKIP_DIRS: Final[frozenset[str]] = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        "node_modules",
        "vendor",
        "build",
        "dist",
        "target",
        ".venv",
        "venv",
        ".tox",
        ".next",
        ".nuxt",
        ".cache",
        "__pycache__",
        ".mypy_cache",
        ".pytest_cache",
        "coverage",
        ".terraform",
    }
)
SOURCE_SUFFIXES: Final[frozenset[str]] = frozenset(
    {
        ".py",
        ".pyi",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".ts",
        ".tsx",
        ".vue",
        ".html",
        ".java",
        ".go",
        ".rb",
        ".php",
        ".cs",
        ".kt",
    }
)
MAX_FILE_BYTES: Final = 1_000_000
MAX_FILES: Final = 10_000
MAX_LINES_PER_FILE: Final = 2_000
MAX_ARTEFACTS: Final = 500


def iter_files(root: Path) -> Iterator[tuple[Path, str]]:
    """Yield bounded source files as ``(absolute, relative POSIX path)``."""
    seen = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        try:
            relative = path.relative_to(root).as_posix()
        except ValueError:
            continue
        if any(part in SKIP_DIRS for part in Path(relative).parts):
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        seen += 1
        if seen > MAX_FILES:
            return
        yield path, relative


def read_lines(path: Path) -> list[str]:
    """Read a bounded line list; binary or unreadable files become empty."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    return text.splitlines()[:MAX_LINES_PER_FILE]


def iter_artefacts(root: Path) -> Iterator[tuple[Path, str]]:
    """Yield bounded repository paths; callers never open artefact contents."""
    seen = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        try:
            relative = path.relative_to(root).as_posix()
        except ValueError:
            continue
        if any(part in SKIP_DIRS for part in Path(relative).parts):
            continue
        seen += 1
        if seen > MAX_ARTEFACTS:
            return
        yield path, relative
