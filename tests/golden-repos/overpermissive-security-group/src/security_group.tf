# Fixture-only source stand-in. Not pilot evidence.
# CANARY_overpermissive_security_group_20261127_never_emit
resource "aws_security_group" "fixture" {
  name = "fixture-only"
}
