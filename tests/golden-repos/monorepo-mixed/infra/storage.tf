# Golden fixture: CKV_AWS_19 must fire alongside the application-code finding so the
# applicability filters run across two languages (rules.md section 14).
resource "aws_s3_bucket" "customer_docs" {
  bucket = "customer-docs-example"
}
