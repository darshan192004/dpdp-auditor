# Golden fixture: CKV_AWS_21 must fire — no versioning; an accepted_risk triage keeps
# the finding in the score but badges it separately (rules.md section 9.1).
resource "aws_s3_bucket" "customer_docs" {
  bucket = "customer-docs-example"
}
