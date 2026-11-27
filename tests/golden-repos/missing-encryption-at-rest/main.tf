# Deliberately unencrypted S3 bucket: expected Checkov CKV_AWS_19.
resource "aws_s3_bucket" "data_bucket" {
  bucket = "my-app-data"

  # Missing: server_side_encryption_configuration
  # This triggers checkov CKV_AWS_19
}

# CANARY_missing_encryption_at_rest_20261127_never_emit
