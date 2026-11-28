import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('export routes', () => {
  it('never call the GitHub issue API', async () => {
    const root = join(process.cwd(), 'server/api/v1/scan/[scanId]/export');
    const files = ['sarif.get.ts', 'markdown.get.ts'];
    for (const file of files) {
      const source = await readFile(join(root, file), 'utf8');
      expect(source).not.toContain('api.github.com');
      expect(source).not.toContain('/issues');
      expect(source).not.toContain('createIssue');
    }
  });
});
