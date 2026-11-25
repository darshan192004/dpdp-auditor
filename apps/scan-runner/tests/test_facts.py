"""Tests for repository fact collection (rules.md §13).

Facts decide which controls are assessed: an empty payload silently drops
every conditional control from the score, so detection must be correct for
each fact kind and must ignore dependency/build directories.
"""

from __future__ import annotations

import json
from pathlib import Path

from scan_runner.facts import collect_facts


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_detects_languages_from_extensions(tmp_path: Path) -> None:
    write(tmp_path / "app.py", "print('hi')")
    write(tmp_path / "client.js", "console.log(1)")
    write(tmp_path / "types.ts", "export type T = string;")
    write(tmp_path / "component.vue", "<template><div /></template>")

    facts = collect_facts(tmp_path)

    # A Vue SFC is JavaScript with a template block.
    assert facts["languages"] == ["javascript", "python", "typescript"]


def test_ignores_dependency_and_build_directories(tmp_path: Path) -> None:
    write(tmp_path / "node_modules" / "dep" / "index.js", "x")
    write(tmp_path / "vendor" / "lib.rb", "x")
    write(tmp_path / "dist" / "bundle.js", "x")
    write(tmp_path / ".venv" / "site.py", "x")
    write(tmp_path / ".git" / "hooks" / "pre-commit.py", "x")
    write(tmp_path / "src" / "main.py", "x")

    facts = collect_facts(tmp_path)

    assert facts["languages"] == ["python"]


def test_detects_js_frameworks_from_package_json(tmp_path: Path) -> None:
    write(
        tmp_path / "package.json",
        '{"dependencies": {"vue": "^3.0.0"}, "devDependencies": {"nuxt": "^3.0.0"}}',
    )

    facts = collect_facts(tmp_path)

    assert facts["frameworks"] == ["nuxt", "vue"]


def test_detects_frameworks_from_nested_manifests(tmp_path: Path) -> None:
    write(tmp_path / "web" / "package.json", '{"dependencies": {"vue": "^3.0.0"}}')
    write(tmp_path / "api" / "requirements.txt", "flask==3.0\n")
    write(tmp_path / "worker" / "Gemfile", "gem 'rails'\n")
    write(tmp_path / "php" / "composer.json", '{"require": {"laravel/framework": "^11.0"}}')
    # Dependencies must not contribute facts even when nested.
    write(
        tmp_path / "web" / "node_modules" / "vue" / "package.json",
        '{"dependencies": {"react": "^18"}}',
    )

    facts = collect_facts(tmp_path)

    assert facts["frameworks"] == ["flask", "laravel", "rails", "vue"]


def test_detects_python_frameworks_from_nested_dev_requirements(tmp_path: Path) -> None:
    write(tmp_path / "api" / "requirements" / "dev.txt", "fastapi>=0.100\n")
    write(tmp_path / "api" / "pyproject.toml", '[project]\ndependencies = ["django"]\n')

    facts = collect_facts(tmp_path)

    assert facts["frameworks"] == ["django", "fastapi"]


def test_detects_python_frameworks_from_requirements(tmp_path: Path) -> None:
    write(tmp_path / "requirements.txt", "Django==5.0\nrequests==2.31\n")

    facts = collect_facts(tmp_path)

    assert facts["frameworks"] == ["django"]


def test_detects_rails_from_gemfile(tmp_path: Path) -> None:
    write(tmp_path / "Gemfile", "source 'https://rubygems.org'\ngem 'rails', '~> 7.1'\n")

    facts = collect_facts(tmp_path)

    assert facts["frameworks"] == ["rails"]


def test_detects_terraform_resource_types(tmp_path: Path) -> None:
    write(
        tmp_path / "main.tf",
        'resource "aws_s3_bucket" "logs" {\n  bucket = "logs"\n}\n'
        'resource "aws_db_instance" "primary" {\n  engine = "postgres"\n}\n',
    )

    facts = collect_facts(tmp_path)

    assert facts["resourceTypes"] == ["aws_db_instance", "aws_s3_bucket"]


def test_maps_cloudformation_types_to_catalog_names(tmp_path: Path) -> None:
    write(
        tmp_path / "stack.yaml",
        "Resources:\n"
        "  Assets:\n"
        "    Type: AWS::S3::Bucket\n"
        "  Database:\n"
        "    Type: AWS::RDS::DBInstance\n",
    )

    facts = collect_facts(tmp_path)

    assert facts["resourceTypes"] == ["aws_db_instance", "aws_s3_bucket"]


def test_maps_cloudformation_json_resource_types(tmp_path: Path) -> None:
    template = {
        "Resources": {
            "Assets": {"Type": "AWS::S3::Bucket"},
            "Database": {"Type": "AWS::RDS::DBInstance"},
            "Table": {"Type": "AWS::DynamoDB::Table"},
        }
    }
    write(tmp_path / "stack.json", json.dumps(template))

    facts = collect_facts(tmp_path)

    assert facts["resourceTypes"] == ["aws_db_instance", "aws_dynamodb_table", "aws_s3_bucket"]


def test_detects_kubernetes_workloads(tmp_path: Path) -> None:
    write(
        tmp_path / "deploy.yaml",
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n",
    )

    facts = collect_facts(tmp_path)

    assert facts["resourceTypes"] == ["kubernetes_deployment"]


def test_ignores_yaml_without_api_version(tmp_path: Path) -> None:
    # A CI/config YAML has `kind:`-like keys but is not a Kubernetes manifest.
    write(tmp_path / ".github" / "workflows" / "ci.yml", "name: CI\non: push\njobs:\n  build:\n")

    facts = collect_facts(tmp_path)

    assert facts["resourceTypes"] == []


def test_returns_sorted_deterministic_facts(tmp_path: Path) -> None:
    write(tmp_path / "b.py", "x")
    write(tmp_path / "a.py", "x")
    write(tmp_path / "c.js", "x")

    first = collect_facts(tmp_path)
    second = collect_facts(tmp_path)

    assert first == second
    assert first["languages"] == sorted(first["languages"])


def test_empty_workspace_returns_empty_fact_lists(tmp_path: Path) -> None:
    facts = collect_facts(tmp_path)

    assert facts == {"languages": [], "frameworks": [], "resourceTypes": []}


def test_survives_binary_and_oversized_files(tmp_path: Path) -> None:
    # Binary content must not break language detection.
    (tmp_path / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00\x01")
    write(tmp_path / "real.py", "x")
    # An oversized generated file is skipped rather than parsed.
    big = tmp_path / "generated.tf"
    big.write_text("resource \"aws_s3_bucket\" \"x\" {}\n", encoding="utf-8")
    big.write_bytes(b"#" * 2_000_000)

    facts = collect_facts(tmp_path)

    assert facts["languages"] == ["python"]
    assert facts["resourceTypes"] == []
