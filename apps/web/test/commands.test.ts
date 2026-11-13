import { describe, expect, it } from 'vitest';

import { APP_COMMANDS, filterCommands, groupCommands } from '../app/utils/commands';

describe('command palette data', () => {
  it('lists every primary destination exactly once', () => {
    const pages = APP_COMMANDS.filter((command) => command.group === 'Pages').map(
      (command) => command.to,
    );

    expect(new Set(pages).size).toBe(pages.length);
    expect(pages).toContain('/app');
    expect(pages).toContain('/app/rules');
  });

  it('gives every command a unique id', () => {
    const ids = APP_COMMANDS.map((command) => command.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('filterCommands', () => {
  it('returns every command for an empty or whitespace query', () => {
    expect(filterCommands(APP_COMMANDS, '')).toHaveLength(APP_COMMANDS.length);
    expect(filterCommands(APP_COMMANDS, '   ')).toHaveLength(APP_COMMANDS.length);
  });

  it('matches label, hint, and group case-insensitively', () => {
    expect(filterCommands(APP_COMMANDS, 'AUDIT').map((command) => command.to)).toContain(
      '/app/audit',
    );
    expect(filterCommands(APP_COMMANDS, 'default branch').map((command) => command.id)).toEqual([
      'action:connect',
    ]);
  });

  it('finds settings by the words people use for it', () => {
    expect(filterCommands(APP_COMMANDS, 'organisation').map((command) => command.to)).toEqual([
      '/app/settings/org',
    ]);
    expect(filterCommands(APP_COMMANDS, 'retention').map((command) => command.to)).toEqual([
      '/app/settings/org',
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterCommands(APP_COMMANDS, 'zzzz')).toEqual([]);
  });
});

describe('groupCommands', () => {
  it('keeps declaration order and groups consecutive commands', () => {
    const groups = groupCommands(APP_COMMANDS);

    expect(groups.map((group) => group.label)).toEqual(['Pages', 'Actions']);
    expect(groups[0]?.commands).toHaveLength(6);
    expect(groups[1]?.commands).toHaveLength(3);
  });

  it('drops empty groups when filtering narrows the list', () => {
    const groups = groupCommands(filterCommands(APP_COMMANDS, 'catalog'));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Actions');
  });
});
