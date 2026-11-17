# Golden fixture coverage

The Phase 6 additions have not been validated by running their scanners. Passing
manifest-schema tests validates metadata, not detection coverage or closed-beta
readiness.

`plannedFindings` preserves the original proposed findings for weak-auth-session,
hardcoded-credentials, insecure-cookies, insecure-deserialization,
missing-audit-logging, missing-csp-headers, and missing-rate-limits. Their proposed
control identifiers have no corresponding mappings in the current rule pack.
They are not executable scanner expectations: implement and validate detection
rules and mappings before promoting them into `expectedFindings`. An empty
`expectedFindings` list does not certify the fixture as secure or complete.

The missing-encryption-at-rest fixture uses the existing CKV_AWS_19 mapping and
valid Terraform syntax. Its scanner output and count still require validation.
No scanner validation, coverage threshold, schema requirement, or CI job is disabled
by these metadata repairs.
