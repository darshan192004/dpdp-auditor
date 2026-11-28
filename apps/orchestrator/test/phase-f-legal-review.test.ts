import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const changelog = () => readFileSync(join(root, 'packages/rule-packs/v2/CHANGELOG.md'), 'utf8');

const OFFICIAL_URLS = [
  'https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf',
  'https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf',
  'https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf',
];

describe('Phase F legal review record', () => {
  it('records a reviewer and an ISO review date for dpdpa-2026.11.0', () => {
    const text = changelog();
    expect(text).toContain('## Legal review — 2026.11.0');
    expect(text).toMatch(/^- Reviewer: .+/m);
    expect(text).toMatch(/^- Review date: \d{4}-\d{2}-\d{2}$/m);
  });

  it('records the re-verified official gazette URLs', () => {
    const text = changelog();
    for (const url of OFFICIAL_URLS) expect(text).toContain(url);
  });

  it('states that no legal opinion, certificate, badge, or pilot sign-off is claimed', () => {
    expect(changelog()).toContain(
      'No legal opinion, certificate, badge, or pilot sign-off is claimed.',
    );
  });
});
