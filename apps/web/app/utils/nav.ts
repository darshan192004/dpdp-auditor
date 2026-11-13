// Application navigation — docs/design.md §3.1 (exactly these six destinations).
export interface AppNavItem {
  label: string;
  to: string;
  icon: string;
  /** Extra search terms for the command palette; the sidebar never renders it. */
  hint?: string;
}

export const APP_NAV: AppNavItem[] = [
  { label: 'Overview', to: '/app', icon: 'overview', hint: 'Score, coverage, recent scans' },
  {
    label: 'Repositories',
    to: '/app/repos',
    icon: 'repositories',
    hint: 'GitHub repositories and connections',
  },
  { label: 'Scans', to: '/app/scans', icon: 'scans', hint: 'Scan history and scorecards' },
  { label: 'Rules', to: '/app/rules', icon: 'rules', hint: 'DPDPA controls and evidence' },
  { label: 'Audit', to: '/app/audit', icon: 'audit', hint: 'Triage decisions and exports' },
  {
    label: 'Settings',
    to: '/app/settings/org',
    icon: 'settings',
    hint: 'Organisation, plan, retention',
  },
];
