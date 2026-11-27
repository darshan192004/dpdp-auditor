# checkov==3.2.0
"""Custom readiness-gap policies. Test fixtures are inputs only."""

from __future__ import annotations

from typing import Any

from checkov.common.models.enums import CheckCategories, CheckResult
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck


class S3BucketPersonalDataEncrypted(BaseResourceCheck):
    def __init__(self) -> None:
        super().__init__(
            name="Ensure buckets holding personal data enable server-side encryption",
            id="ckv_dpdp_a_1",
            categories=(CheckCategories.ENCRYPTION,),
            supported_resources=("aws_s3_bucket",),
        )

    def scan_resource_conf(self, conf: dict[str, list[Any]]) -> CheckResult:
        if conf.get("server_side_encryption_configuration"):
            return CheckResult.PASSED
        return CheckResult.FAILED


check = S3BucketPersonalDataEncrypted()
