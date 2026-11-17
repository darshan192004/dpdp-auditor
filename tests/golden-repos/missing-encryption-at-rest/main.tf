# DPDPA Golden Repo: Missing Encryption at Rest
# P6-15: Golden repo #13 of 20
# Expected findings: Encryption control violations

manifest:
  name: missing-encryption-at-rest
  description: Terraform S3 bucket without server-side encryption
  expectedFindings:
    - control: DPDPA-8.4-ENC-01
      severity: high
      scanner: checkov
      description: S3 bucket without server-side encryption enabled

---
# Terraform: S3 bucket without encryption
resource "aws_s3_bucket" "data_bucket" {
  bucket = "my-app-data"

  # Missing: server_side_encryption_configuration
  # This triggers checkov CKV_AWS_52
}

resource "aws_s3_bucket_server_side_encryption_configuration" "missing" {
  # Intentionally not applied to the bucket above
  bucket = aws_s3_bucket.data_bucket.id
  # Commented out to simulate missing encryption
  # rule {
  #   apply_server_side_encryption_by_default {
  #     sse_algorithm = "AES256"
  #   }
  # }
}
