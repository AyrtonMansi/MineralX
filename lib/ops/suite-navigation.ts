import type { Scope, ScopeKind } from './contracts';

export type OperationsArea =
  | ''
  | 'programs'
  | 'work'
  | 'reports'
  | 'geology'
  | 'pit'
  | 'plant'
  | 'gold'
  | 'files'
  | 'field'
  | 'admin'
  | 'account';

export type NavigationItem = {
  area: OperationsArea;
  label: string;
  requiredKind?: ScopeKind;
  permission?: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export type CreateShortcut = {
  area: OperationsArea;
  label: string;
  params: string;
};

const shared: NavigationItem[] = [
  { area: '', label: 'Home' },
  { area: 'programs', label: 'Programs', permission: 'work.read' },
  { area: 'work', label: 'Work', permission: 'work.read' },
  { area: 'reports', label: 'Reports' },
];

const projectWork: NavigationItem[] = [
  { area: 'geology', label: 'Geology', requiredKind: 'project', permission: 'geo.read' },
  { area: 'pit', label: 'Pits & stockpiles', requiredKind: 'project' },
  { area: 'field', label: 'Field preparation', requiredKind: 'project', permission: 'geo.read' },
];

const facilityWork: NavigationItem[] = [
  { area: 'plant', label: 'Plant', requiredKind: 'facility', permission: 'plant.read' },
  { area: 'gold', label: 'Gold', requiredKind: 'facility', permission: 'gold.read' },
];

const resources: NavigationItem[] = [
  { area: 'work', label: 'People & workload', permission: 'work.read' },
  { area: 'files', label: 'Files & procedures' },
];

export function supportsNavigationItem(scope: Scope | undefined, item: NavigationItem) {
  if (!scope) return false;
  if (item.requiredKind && scope.kind !== item.requiredKind) return false;
  return !item.permission || scope.permissions.includes(item.permission);
}

export function navigationGroups(scope: Scope | undefined): NavigationGroup[] {
  if (!scope) return [];
  const capture = scope.kind === 'project' ? projectWork : scope.kind === 'facility' ? facilityWork : [];
  return [
    { label: 'Workspace', items: shared.filter((item) => supportsNavigationItem(scope, item)) },
    { label: 'Record work', items: capture.filter((item) => supportsNavigationItem(scope, item)) },
    { label: 'Resources', items: resources.filter((item) => supportsNavigationItem(scope, item)) },
  ].filter((group) => group.items.length);
}

/**
 * The Create menu only offers a destination when the user can both open its
 * register and perform the proposed capture. Custom roles frequently split
 * read and capture privileges, so testing only work.write here creates a
 * dead-end route.
 */
export function createShortcuts(scope: Scope | undefined): CreateShortcut[] {
  if (!scope || !scope.permissions.includes('work.read') || !scope.permissions.includes('work.write')) return [];

  const shortcuts: CreateShortcut[] = [
    { area: 'programs', label: 'Work program / campaign', params: 'action=create' },
    { area: 'work', label: 'Task / to-do', params: 'action=task' },
    { area: 'work', label: 'Handover', params: 'action=task&kind=handover' },
  ];

  if (scope.kind === 'project') {
    if (scope.permissions.includes('geo.read') && scope.permissions.includes('geo.capture')) {
      shortcuts.push({ area: 'geology', label: 'Physical sample', params: 'action=sample' });
    }
  } else if (scope.kind === 'facility') {
    if (scope.permissions.includes('plant.read') && scope.permissions.includes('plant.capture')) {
      shortcuts.push({ area: 'plant', label: 'Processing run', params: 'view=runs&action=run' });
    }
    if (scope.permissions.includes('gold.read') && scope.permissions.includes('gold.capture')) {
      shortcuts.push({ area: 'gold', label: 'Clean-up / gold lot', params: 'view=lots&action=cleanup' });
    }
  }

  return shortcuts;
}

export function operationsHref(area: OperationsArea, scopeId?: string, params?: URLSearchParams | string) {
  const search = typeof params === 'string' ? new URLSearchParams(params) : new URLSearchParams(params);
  if (scopeId) search.set('scope', scopeId);
  const query = search.toString();
  return `/ops${area ? `/${area}` : ''}${query ? `?${query}` : ''}`;
}

export function requiredScopeKind(pathname: string): ScopeKind | null {
  if (/^\/ops\/(geology|pit|field)(?:\/|$)/.test(pathname)) return 'project';
  if (/^\/ops\/(plant|gold)(?:\/|$)/.test(pathname)) return 'facility';
  return null;
}

export function supportsOperationsPath(scope: Scope, pathname: string) {
  const required = requiredScopeKind(pathname);
  if (required && scope.kind !== required) return false;
  if (/^\/ops\/(programs|work)(?:\/|$)/.test(pathname)) return scope.permissions.includes('work.read');
  if (/^\/ops\/(geology|field)(?:\/|$)/.test(pathname)) return scope.permissions.includes('geo.read');
  if (/^\/ops\/plant(?:\/|$)/.test(pathname)) return scope.permissions.includes('plant.read');
  if (/^\/ops\/gold(?:\/|$)/.test(pathname)) return scope.permissions.includes('gold.read');
  return true;
}

/**
 * Changing a workspace should preserve the user's current purpose when that
 * purpose is valid in the destination. Record-specific context is cleared so
 * an ID from one authorised boundary is never presented in another.
 */
export function scopeSwitchDestination(pathname: string, search: string, nextScope: Scope) {
  if (!supportsOperationsPath(nextScope, pathname)) return operationsHref('', nextScope.id);

  const params = new URLSearchParams(search);
  for (const key of ['item', 'action', 'program', 'asset']) params.delete(key);
  return operationsHref(pathname.replace(/^\/ops\/?/, '') as OperationsArea, nextScope.id, params);
}

export function isCurrentOperationsArea(pathname: string, area: OperationsArea) {
  return area === '' ? pathname === '/ops' : pathname === `/ops/${area}`;
}
