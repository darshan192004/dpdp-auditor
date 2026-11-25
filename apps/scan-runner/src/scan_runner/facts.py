"""Repository fact collection for applicability predicates (rules.md §13).

The runner delivers ``languages``, ``frameworks`` and ``resourceTypes`` with
the completion callback; scoring excludes any control whose ``appliesWhen``
predicate does not match them. An empty fact set therefore silently drops
every conditional control from the assessment, so this module must report what
the repository actually contains.

Facts describe structure only — never file contents — and collection is a
single bounded pass over the checkout.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterable

# Directories that never contribute facts (dependencies, build output, VCS).
SKIP_DIRS = frozenset(
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
    },
)

# File extension → language name used by `appliesWhen` predicates.
LANGUAGE_BY_EXT: dict[str, str] = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    # A Vue single-file component is JavaScript with a template block.
    ".vue": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".fs": "fsharp",
    ".rs": "rust",
    ".swift": "swift",
    ".scala": "scala",
    ".sh": "shell",
    ".bash": "shell",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".ex": "elixir",
    ".exs": "elixir",
    ".dart": "dart",
    ".r": "r",
}

# package.json dependency name → framework id used by predicates.
JS_FRAMEWORKS = {
    "react": "react",
    "vue": "vue",
    "nuxt": "nuxt",
    "next": "next",
    "@angular/core": "angular",
    "svelte": "svelte",
    "express": "express",
    "koa": "koa",
    "@nestjs/core": "nestjs",
    "fastify": "fastify",
    "gatsby": "gatsby",
    "remix": "remix",
    "solid-js": "solid",
}

# requirements.txt / pyproject name → framework id.
PY_FRAMEWORKS = {
    "django": "django",
    "flask": "flask",
    "fastapi": "fastapi",
    "tornado": "tornado",
    "pyramid": "pyramid",
    "starlette": "starlette",
}

# CloudFormation `Type:` value → the Terraform-style resource type the control
# catalog uses. Only the types the catalog references need a mapping; anything
# else falls back to the mechanical `aws_x_y` lowering.
CFN_TYPE_MAP: dict[str, str] = {
    "AWS::S3::Bucket": "aws_s3_bucket",
    "AWS::RDS::DBInstance": "aws_db_instance",
    "AWS::EC2::Instance": "aws_instance",
    "AWS::EC2::SecurityGroup": "aws_security_group",
    "AWS::ElasticLoadBalancingV2::Listener": "aws_lb_listener",
    "AWS::CloudFront::Distribution": "aws_cloudfront_distribution",
    "AWS::CloudTrail::Trail": "aws_cloudtrail",
    "AWS::CloudWatch::Alarm": "aws_cloudwatch_alarm",
    "AZURE::Storage::StorageAccount": "azurerm_storage_account",
    "Google::Storage::Bucket": "google_storage_bucket",
}

# Terraform / Pulumi resource block: resource "aws_s3_bucket" "logs" {
_TF_RESOURCE_RE = re.compile(
    r'^\s*(?:resource|data)\s+"([a-z0-9_]+_[a-z0-9_]+)"\s+"', re.MULTILINE
)
# CloudFormation: Type: AWS::S3::Bucket
_CFN_TYPE_RE = re.compile(r"^\s*Type:\s*['\"]?([A-Za-z0-9]+::[A-Za-z0-9:]+)", re.MULTILINE)
# Kubernetes manifest: kind: Deployment
_K8S_KIND_RE = re.compile(r"^kind:\s*([A-Za-z]+)\s*$", re.MULTILINE)
# Python import / requirements line: from django ... | import django | django==4.2
_PY_IMPORT_RE = re.compile(r"^\s*(?:from|import)\s+([a-z_][a-z0-9_]*)", re.MULTILINE)
_REQ_LINE_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)", re.MULTILINE)

MAX_FACT_FILE_BYTES = 1_000_000  # never parse an oversized generated file


def _iter_files(workspace: Path) -> Iterable[Path]:
    """Yield tracked-size files under *workspace*, pruning SKIP_DIRS."""
    for path in workspace.rglob("*"):
        if not path.is_file():
            continue
        try:
            relative = path.relative_to(workspace)
        except ValueError:  # pragma: no cover - rglob always stays inside
            continue
        if any(part in SKIP_DIRS for part in relative.parts):
            continue
        yield path


def _read_text(path: Path) -> str:
    """Read a text file, tolerating binary content and enforcing a size cap."""
    try:
        if path.stat().st_size > MAX_FACT_FILE_BYTES:
            return ""
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def _iter_manifests(workspace: Path) -> Iterable[Path]:
    """Yield dependency manifests anywhere under *workspace*, pruning SKIP_DIRS."""
    names = {"package.json", "requirements.txt", "pyproject.toml", "Gemfile", "composer.json"}
    for path in _iter_files(workspace):
        if path.name in names or (path.name == "dev.txt" and path.parent.name == "requirements"):
            yield path


def _language_facts(workspace: Path) -> set[str]:
    languages: set[str] = set()
    for path in _iter_files(workspace):
        language = LANGUAGE_BY_EXT.get(path.suffix.lower())
        if language:
            languages.add(language)
    return languages


def _framework_facts(workspace: Path) -> set[str]:
    frameworks: set[str] = set()

    for path in _iter_manifests(workspace):
        text = _read_text(path)
        if path.name == "package.json":
            try:
                manifest = json.loads(text)
            except json.JSONDecodeError:
                manifest = {}
            if isinstance(manifest, dict):
                for section in ("dependencies", "devDependencies", "peerDependencies"):
                    deps = manifest.get(section)
                    if isinstance(deps, dict):
                        for name in deps:
                            framework = JS_FRAMEWORKS.get(str(name).lower())
                            if framework:
                                frameworks.add(framework)
        elif path.name == "pyproject.toml":
            # `[tool.django]`-style markers plus bare project names.
            for framework in PY_FRAMEWORKS:
                if re.search(rf"\b{re.escape(framework)}\b", text, re.IGNORECASE):
                    frameworks.add(framework)
        elif path.name in {"requirements.txt", "dev.txt"}:
            for line in text.splitlines():
                match = _REQ_LINE_RE.match(line)
                if match:
                    normalized = re.split(r"[<>=!\[;]", match.group(1))[0].strip().lower()
                    framework = PY_FRAMEWORKS.get(normalized)
                    if framework:
                        frameworks.add(framework)
        elif path.name == "Gemfile":
            if re.search(r"^\s*gem\s+['\"]rails['\"]", text, re.M):
                frameworks.add("rails")
        elif path.name == "composer.json" and "laravel/framework" in text:
            frameworks.add("laravel")

    return frameworks


def _cfn_resource_type(cfn_type: str) -> str | None:
    """Map a CloudFormation type to the catalog's resource type name."""
    mapped = CFN_TYPE_MAP.get(cfn_type)
    if mapped is None and cfn_type.startswith(("AWS::", "AZURE::", "Google::")):
        provider, _, resource = cfn_type.partition("::")
        mapped = f"{provider.lower()}_{resource.replace('::', '_').lower()}"
    return mapped


def _resource_facts(workspace: Path) -> set[str]:
    resource_types: set[str] = set()

    for path in _iter_files(workspace):
        suffix = path.suffix.lower()
        if suffix == ".tf":
            text = _read_text(path)
            resource_types.update(_TF_RESOURCE_RE.findall(text))
        elif suffix in {".yaml", ".yml", ".json", ".template"}:
            text = _read_text(path)
            if not text:
                continue
            # CloudFormation templates are valid JSON as well as YAML; the
            # `Type:` regex alone misses JSON's quoted keys.
            document: object = None
            try:
                document = json.loads(text)
            except json.JSONDecodeError:
                document = None
            if isinstance(document, dict):
                resources = document.get("Resources")
                if isinstance(resources, dict):
                    for resource in resources.values():
                        if isinstance(resource, dict):
                            cfn_type = resource.get("Type")
                            if isinstance(cfn_type, str):
                                mapped = _cfn_resource_type(cfn_type)
                                if mapped:
                                    resource_types.add(mapped)
            for cfn_type in _CFN_TYPE_RE.findall(text):
                mapped = _cfn_resource_type(cfn_type)
                if mapped:
                    resource_types.add(mapped)
            # Kubernetes manifests: a bare `kind:` line (not nested under spec).
            if "apiVersion:" in text:
                for kind in _K8S_KIND_RE.findall(text):
                    if kind.lower() in {
                        "deployment",
                        "statefulset",
                        "daemonset",
                        "pod",
                        "service",
                        "job",
                        "cronjob",
                    }:
                        resource_types.add(f"kubernetes_{kind.lower()}")

    return resource_types


def collect_facts(workspace: Path) -> dict[str, list[str]]:
    """Return the RepoFacts payload for the completion callback.

    Values are sorted so the payload is deterministic for a given checkout,
    which keeps signed-callback tests and golden fixtures stable.
    """
    languages = _language_facts(workspace)
    frameworks = _framework_facts(workspace)
    resource_types = _resource_facts(workspace)
    return {
        "languages": sorted(languages),
        "frameworks": sorted(frameworks),
        "resourceTypes": sorted(resource_types),
    }


def facts_payload(workspace: Path) -> dict[str, Any]:
    """Alias kept for call sites that want the JSON-ready mapping."""
    return collect_facts(workspace)
