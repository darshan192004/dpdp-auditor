/** A navigation target for the readiness command palette. */
export interface PaletteItem {
  id: string;
  label: string;
  href: string;
  hint?: string;
}

/** Ready-to-use, readiness-safe destinations shared by composed pages. */
export const DEFAULT_PALETTE_ITEMS: readonly PaletteItem[] = [
  { id: 'overview', label: 'Overview', href: '/app', hint: 'Dashboard' },
  { id: 'scans', label: 'Scans', href: '/app/scans', hint: 'Scan history' },
  { id: 'repositories', label: 'Repositories', href: '/app/repos', hint: 'Connected repositories' },
  { id: 'rules', label: 'Rules', href: '/app/rules', hint: 'Rule mappings' },
  { id: 'audit', label: 'Audit log', href: '/app/audit', hint: 'Activity' },
];
