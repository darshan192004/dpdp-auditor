# Golden fixture: CKV_AWS_19 must fire — no server-side encryption on this bucket.
resource "aws_s3_bucket" "customer_docs" {
  bucket = "customer-docs-example"
}
