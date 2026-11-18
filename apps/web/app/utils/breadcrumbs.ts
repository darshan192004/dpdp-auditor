export interface Crumb {
  label: string;
  to?: string;
}

function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

/** The final crumb is the current page, so it must not be a link. */
function withoutTrailingLink(crumbs: Crumb[]): Crumb[] {
  if (crumbs.length === 0) return crumbs;
  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb,
  );
}

export function breadcrumbsFor(path: string): Crumb[] {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'app') return [];

  const crumbs: Crumb[] = [{ label: 'Overview', to: '/app' }];
  const section = parts[1];
  if (section === undefined) return withoutTrailingLink(crumbs);

  if (section === 'scans') {
    crumbs.push({ label: 'Scans', to: '/app/scans' });
    const scanId = parts[2];
    const child = parts[3];
    if (scanId) crumbs.push({ label: scanId, to: `/app/scans/${scanId}` });
    if (child) crumbs.push({ label: titleCase(child) });
    return withoutTrailingLink(crumbs);
  }

  crumbs.push({ label: titleCase(section), to: `/app/${section}` });
  return withoutTrailingLink(crumbs);
}
