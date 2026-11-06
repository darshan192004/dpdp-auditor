# Golden fixture: CKV_AWS_20 must fire — public-read ACL on a data bucket.
resource "aws_s3_bucket" "customer_docs" {
  bucket = "customer-docs-example"
  acl    = "public-read"
}
