# Fixture-only source stand-in. Not pilot evidence.
# CANARY_public_bucket_20261127_never_emit
resource "aws_s3_bucket" "fixture" {
  bucket = "fixture-only"
}
