resource "aws_s3_bucket" "personal_data" {
  bucket = "fixture-personal-data"

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}
