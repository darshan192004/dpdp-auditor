import { APP_NAV } from './nav';

/**
 * Command palette entries (⌘K). Pattern follows the Untitled UI / Preline
 * "quick search" dialogs: pages and actions in one fuzzy list, keyboard-first.
 * Kept as data so the palette component stays presentational and testable.
 */
export interface AppCommand {
  id: string;
  label: string;
  to: string;
  group: 'Pages' | 'Actions';
  icon: string;
  hint?: string;
}

export const APP_COMMANDS: AppCommand[] = [
  ...APP_NAV.map<AppCommand>((item) => ({
    id: `page:${item.to}`,
    label: item.label,
    to: item.to,
    group: 'Pages',
    icon: item.icon,
    ...(item.hint === undefined ? {} : { hint: item.hint }),
  })),
  {
    id: 'action:connect',
    label: 'Connect a repository',
    to: '/app/repos',
    group: 'Actions',
    icon: 'plus',
    hint: 'Scan the default branch',
  },
  {
    id: 'action:rules',
    label: 'Browse the control catalog',
    to: '/app/rules',
    group: 'Actions',
    icon: 'rules',
    hint: 'DPDPA controls and scanner mappings',
  },
  {
    id: 'action:audit',
    label: 'Review the audit trail',
    to: '/app/audit',
    group: 'Actions',
    icon: 'clipboard-check',
    hint: 'Triage decisions and exports',
  },
];

/** Case-insensitive substring match over label, hint, and group. */
export function filterCommands(commands: AppCommand[], query: string): AppCommand[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return commands;
  return commands.filter((command) =>
    `${command.label} ${command.hint ?? ''} ${command.group}`.toLowerCase().includes(needle),
  );
}

/** Preserve declaration order while collecting consecutive groups. */
export function groupCommands(
  commands: AppCommand[],
): Array<{ label: AppCommand['group']; commands: AppCommand[] }> {
  const groups: Array<{ label: AppCommand['group']; commands: AppCommand[] }> = [];
  for (const command of commands) {
    const group = groups.find((entry) => entry.label === command.group);
    if (group) group.commands.push(command);
    else groups.push({ label: command.group, commands: [command] });
  }
  return groups;
}
