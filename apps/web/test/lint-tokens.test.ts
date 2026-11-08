import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scanForRawHex } from '../scripts/lint-tokens.mjs';

const TOKEN_FILE = 'app/assets/css/main.css';

describe('scanForRawHex', () => {
  it('reports raw hex in a .vue template and in a <style> block with line numbers', () => {
    const content = [
      '<template>',
      '  <div class="text-[#0d9488]">Hello</div>',
      '</template>',
      '',
      '<style scoped>',
      '.brand { color: #0d9488; }',
      '</style>',
    ].join('\n');

    const hits = scanForRawHex([{ path: 'app/pages/index.vue', content }], TOKEN_FILE);

    expect(hits).toEqual([
      { path: 'app/pages/index.vue', line: 2 },
      { path: 'app/pages/index.vue', line: 6 },
    ]);
  });

  it('reports short hex in a non-exempt .css file', () => {
    const content = ['body {', '  background: #fff;', '}'].join('\n');

    const hits = scanForRawHex([{ path: 'app/assets/css/extra.css', content }], TOKEN_FILE);

    expect(hits).toEqual([{ path: 'app/assets/css/extra.css', line: 2 }]);
  });

  it('exempts the token file', () => {
    const content = ['@theme {', '  --color-brand-600: #0d9488;', '}'].join('\n');

    const hits = scanForRawHex([{ path: TOKEN_FILE, content }], TOKEN_FILE);

    expect(hits).toEqual([]);
  });

  it('does not report anchors such as href="#main" or id="main"', () => {
    const content = ['<a href="#main">Skip to content</a>', '<div id="main"></div>'].join('\n');

    const hits = scanForRawHex([{ path: 'app/app.vue', content }], TOKEN_FILE);

    expect(hits).toEqual([]);
  });
});

describe('lint-tokens CLI', () => {
  it('exits 1 and prints path:line when a violation exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'lint-tokens-'));
    const script = resolve(process.cwd(), 'scripts/lint-tokens.mjs');

    try {
      mkdirSync(join(root, 'app', 'pages'), { recursive: true });
      writeFileSync(
        join(root, 'app', 'pages', 'bad.vue'),
        '<template>\n  <p class="x">#0d9488</p>\n</template>\n',
      );

      let exitCode = 0;
      let output = '';
      try {
        execFileSync(process.execPath, [script, root], { encoding: 'utf8' });
      } catch (error) {
        const failure = error as { status?: number; stdout?: string };
        exitCode = failure.status ?? 1;
        output = failure.stdout ?? '';
      }

      expect(exitCode).toBe(1);
      expect(output).toContain('app/pages/bad.vue:2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
