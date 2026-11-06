# Golden fixture: gitleaks must report aws-access-token (DPDPA-8.4-SECRET-01).
# The fake key below is allowlisted in .gitleaks.toml for the CI secret scan only;
# the Phase 4 golden runner must scan with an explicit default config.
AWS_ACCESS_KEY_ID = "AKIAABCDEFGHIJKLMNOP"
