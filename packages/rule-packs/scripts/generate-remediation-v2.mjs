/* global process, URL */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const SNIPPETS = {
  'publish-privacy-notice': { lang: 'md', code: '# Privacy notice\nPublished at: {{NOTICE_URL}}' },
  'complete-notice-content': { lang: 'md', code: 'Purposes: {{PURPOSES}}\nRights: {{RIGHTS}}' },
  'gate-processing-on-consent': {
    lang: 'python',
    code: 'if not consent.granted("{{PURPOSE}}"):\n    return None',
  },
  'gate-web-forms-on-consent': { lang: 'ts', code: 'if (!consent.granted("{{PURPOSE}}")) return;' },
  'remove-unnecessary-fields': { lang: 'ts', code: 'const allowedFields = ["email"] as const;' },
  'add-consent-withdrawal': {
    lang: 'python',
    code: 'def withdraw(consent_id: str) -> None:\n    store.record_withdrawal(consent_id)',
  },
  'record-lawful-basis': { lang: 'python', code: 'processing.lawful_basis = "consent"' },
  'enable-encryption-at-rest': {
    lang: 'hcl',
    code: 'server_side_encryption_configuration {\n  rule {\n    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }\n  }\n}',
  },
  'restrict-public-access': {
    lang: 'hcl',
    code: 'resource "aws_s3_bucket_public_access_block" "personal_data" {\n  bucket = aws_s3_bucket.personal_data.id\n  block_public_acls = true\n}',
  },
  'remove-hardcoded-secrets': { lang: 'python', code: 'api_key = os.environ["API_KEY"]' },
  'redact-personal-data-from-logs': {
    lang: 'python',
    code: 'logger.info("user_id=%s", hash_user_id(user.id))',
  },
  'add-audit-logging': {
    lang: 'python',
    code: 'audit.log(event="personal_data_read", actor=actor_id)',
  },
  'add-backup-policy': { lang: 'yaml', code: 'backup:\n  retentionDays: 30\n  encrypted: true' },
  'enforce-retention-limit': { lang: 'python', code: 'delete_expired(rows, ttl_days=30)' },
  'enforce-password-policy': {
    lang: 'yaml',
    code: 'passwordPolicy:\n  minLength: 12\n  rotateDays: 90',
  },
  'secure-session-config': {
    lang: 'ts',
    code: 'cookie: { secure: true, httpOnly: true, sameSite: "strict" }',
  },
  'configure-security-headers': {
    lang: 'ts',
    code: 'app.use(helmet({ hsts: true, contentSecurityPolicy: { useDefaults: true } }))',
  },
  'harden-cookie-flags': {
    lang: 'js',
    code: 'res.cookie("session_id", token, { secure: true, httpOnly: true, sameSite: "strict" })',
  },
  'enable-cmp-consent-mode': {
    lang: 'js',
    code: 'const cmpConfig = { enabled: true, mode: "advanced" };',
  },
  'pin-dependency-versions': { lang: 'yaml', code: 'dependencies:\n  lodash: "4.17.21"' },
  'apply-framework-safeguards': { lang: 'js', code: 'app.use(helmet());' },
  'add-breach-alert-hook': { lang: 'python', code: 'on_security_event(notify_incident)' },
  'publish-breach-runbook': { lang: 'md', code: '# Breach runbook\nOwner: {{INCIDENT_OWNER}}' },
  'document-breach-intimation': { lang: 'md', code: 'Intimation window: {{INTIMATION_WINDOW}}' },
  'route-security-events': { lang: 'python', code: 'security_events.subscribe(notify_incident)' },
  'implement-hard-delete': {
    lang: 'python',
    code: 'db.execute("DELETE FROM users WHERE id = %s", (user_id,))',
  },
  'publish-retention-schedule': {
    lang: 'md',
    code: '| Data | Retention |\n|---|---|\n| {{DATA_TYPE}} | {{DAYS}} days |',
  },
  'publish-privacy-contact': { lang: 'md', code: 'Data protection contact: {{CONTACT_EMAIL}}' },
  'publish-grievance-mechanism': { lang: 'md', code: 'Grievance intake: {{GRIEVANCE_URL}}' },
  'add-grievance-redressal': {
    lang: 'ts',
    code: 'await grievanceStore.create({ principalId, text });',
  },
  'add-child-consent-gate': {
    lang: 'python',
    code: 'if subject.is_minor and not guardian_consent: return reject()',
  },
  'add-age-gate': { lang: 'ts', code: 'if (age < 18) showAgeGate();' },
  'document-sdf-governance': { lang: 'md', code: 'DPIA reference: {{DPIA_URL}}' },
  'add-access-export': {
    lang: 'ts',
    code: 'router.get("/dsr/export", requirePrincipal, exportPersonalData);',
  },
  'add-erasure-endpoint': {
    lang: 'ts',
    code: 'router.post("/dsr/erase", requirePrincipal, erasePersonalData);',
  },
  'restrict-cross-border-transfer': {
    lang: 'yaml',
    code: 'transfer:\n  allowedRegions: [ap-south-1]',
  },
  'pin-india-region': { lang: 'hcl', code: 'region = "ap-south-1"' },
  'publish-processor-list': {
    lang: 'md',
    code: '| Processor | Purpose |\n|---|---|\n| {{PROCESSOR}} | {{PURPOSE}} |',
  },
  'document-sdk-purpose': {
    lang: 'js',
    code: 'initAnalytics({ purpose: "{{PURPOSE}}", consentRequired: true });',
  },
  'review-cms-plugins': {
    lang: 'yaml',
    code: 'allowedPlugins:\n  - name: "{{PLUGIN}}"\n    personalData: false',
  },
  'link-privacy-notice-from-forms': {
    lang: 'html',
    code: '<a href="/privacy-notice">Privacy notice</a>',
  },
  'document-pii-literals': {
    lang: 'ts',
    code: 'const FIELD_PURPOSE: Record<string, string> = { email: "{{PURPOSE}}" };',
  },
  'add-form-purpose': { lang: 'html', code: '<p>Purpose: {{PURPOSE}}</p>' },
  'add-privacy-artefacts': { lang: 'md', code: 'docs/privacy/notice.md\ndocs/privacy/dsr-sop.md' },
  'publish-dsr-sop': { lang: 'md', code: '# DSR SOP\nStep 1: verify {{PRINCIPAL_ID}}' },
  'enforce-tls': { lang: 'ts', code: 'app.use(helmet({ hsts: { maxAge: 15552000 } }));' },
};

export async function generateRemediationV2(controls) {
  const sections = [];
  for (const control of controls) {
    if (control.evidenceMode === 'manual' || control.evidenceMode === 'attestation') continue;
    const snippet = SNIPPETS[control.remediationKey];
    if (snippet === undefined) {
      throw new Error(`missing remediation snippet for ${control.code}`);
    }
    sections.push(`## ${control.remediationKey}

### Summary
${control.title}.

### Why it matters
This control is part of the readiness assessment for ${control.actRef}.

### Steps
1. Locate the evidence referenced by ${control.code}.
2. Apply the change shown below.
3. Re-run the scan and confirm the cited gap is gone.

### Code example
\`\`\`${snippet.lang}
${snippet.code}
\`\`\`

### Verification
Confirm the changed path appears in the next scan with a recorded safeguard or no cited gap.

### Effort
Small to medium, depending on the number of affected paths.

### Owner
{{SERVICE_OWNER}}

### References
${control.legalRefs.join(', ')}

### Framework snippets
Use the same change in the matching framework path listed in \`ecosystem_patterns/web.yaml\`.
`);
  }
  const config = await resolveConfig(
    fileURLToPath(new URL('../v2/templates/remediation.md', import.meta.url)),
  );
  return format(
    `# Structured remediation library\n\nGenerated by \`pnpm --filter @dpdpa/rule-packs remediation:v2\`.\n\n${sections.join('\n')}`,
    { ...config, filepath: 'remediation.md' },
  );
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFile, mkdir } = await import('node:fs/promises');
  const YAML = (await import('yaml')).default;
  const controls = YAML.parse(
    await readFile(new URL('../v2/controls.yaml', import.meta.url), 'utf8'),
  ).controls;
  await mkdir(new URL('../v2/templates/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../v2/templates/remediation.md', import.meta.url),
    await generateRemediationV2(controls),
    'utf8',
  );
  process.stdout.write(`remediation.md: ${controls.length} controls\n`);
}
