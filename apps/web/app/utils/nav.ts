// Application navigation — docs/design.md §3.1 (exactly these six destinations).
export interface AppNavItem {
  label: string;
  to: string;
  icon: string;
}

export const APP_NAV: AppNavItem[] = [
  { label: 'Overview', to: '/app', icon: 'overview' },
  { label: 'Repositories', to: '/app/repos', icon: 'repositories' },
  { label: 'Scans', to: '/app/scans', icon: 'scans' },
  { label: 'Rules', to: '/app/rules', icon: 'rules' },
  { label: 'Audit', to: '/app/audit', icon: 'audit' },
  { label: 'Settings', to: '/app/settings/org', icon: 'settings' },
];
