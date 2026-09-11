import type { Scope, ScopeKind } from './contracts';

export type OperationsArea =
  | ''
  | 'intelligence'
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
  /** A same-product app destination that does not use an Operations scope. */
  href?: string;
  /** Optional stable route query for a distinct destination within an area. */
  params?: string;
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
  { area: 'intelligence', label: 'Intelligence inbox', permission: 'work.read' },
];

const planning: NavigationItem[] = [
  { area: 'programs', label: 'Programs', permission: 'work.read' },
  { area: 'work', label: 'Work', permission: 'work.read' },
  { area: 'work', label: 'People & workload', params: 'view=people', permission: 'work.read' },
];

const projectWork: NavigationItem[] = [
  { area: 'geology', label: 'Geology Globe', href: '/mineralx', requiredKind: 'project', permission: 'geo.read' },
  { area: 'geology', label: 'Exploration', requiredKind: 'project', permission: 'geo.read' },
  { area: 'pit', label: 'Pits & stockpiles', requiredKind: 'project', permission: 'geo.read' },
  { area: 'field', label: 'Field preparation', requiredKind: 'project', permission: 'geo.read' },
];

const facilityWork: NavigationItem[] = [
  { area: 'plant', label: 'Plant', requiredKind: 'facility', permission: 'plant.read' },
  { area: 'gold', label: 'Gold', requiredKind: 'facility', permission: 'gold.read' },
];

const resources: NavigationItem[] = [
  { area: 'files', label: 'Files & procedures' },
  { area: 'reports', label: 'Reports' },
];

const developmentWorkspace: NavigationGroup[] = [
  { label: 'Workspace', items: [{ area: '', label: 'Home' }, { area: 'work', label: 'Work', permission: 'work.read' }] },
  {
    label: 'Operations',
    items: [
      { area: 'geology', label: 'Geology Globe', href: '/mineralx', requiredKind: 'project', permission: 'geo.read' },
      { area: 'geology', label: 'Exploration', requiredKind: 'project', permission: 'geo.read' },
      { area: 'pit', label: 'Pits & stockpiles', requiredKind: 'project', permission: 'geo.read' },
      { area: 'plant', label: 'Processing', requiredKind: 'facility', permission: 'plant.read' },
      { area: 'gold', label: 'Gold', requiredKind: 'facility', permission: 'gold.read' },
    ],
  },
];

export function supportsNavigationItem(scope: Scope | undefined, item: NavigationItem) {
  if (!scope) return false;
  if (item.requiredKind && scope.kind !== item.requiredKind) return false;
  return !item.permission || scope.permissions.includes(item.permission);
}

/**
 * Development keeps its project and facility data separated internally, while
 * presenting one local workspace. Each operation links to its compatible
 * internal boundary automatically; people never need to choose a raw scope.
 */
export function developmentNavigationGroups(scopes: Scope[] | undefined): NavigationGroup[] {
  return developmentWorkspace.map((group) => ({
    ...group,
    items: group.items.filter((item) => scopes?.some((scope) => supportsNavigationItem(scope, item))),
  })).filter((group) => group.items.length);
}

export function navigationGroups(scope: Scope | undefined, options?: { development?: boolean; scopes?: Scope[] }): NavigationGroup[] {
  if (options?.development) return developmentNavigationGroups(options.scopes || (scope ? [scope] : []));
  if (!scope) return [];
  const capture = scope.kind === 'project' ? projectWork : scope.kind === 'facility' ? facilityWork : [];
  return [
    { label: 'Start', items: shared.filter((item) => supportsNavigationItem(scope, item)) },
    { label: 'Plan & assign', items: planning.filter((item) => supportsNavigationItem(scope, item)) },
    { label: 'Operate', items: capture.filter((item) => supportsNavigationItem(scope, item)) },
    { label: 'Review & records', items: resources.filter((item) => supportsNavigationItem(scope, item)) },
  ].filter((group) => group.items.length);
}

/** A stable presentation name keeps device-only implementation scopes out of the UI. */
export function scopeLabel(scope: Scope | undefined, development = false) {
  return development ? 'Development workspace' : scope?.name || 'No workspace assigned';
}

/**
 * Keep the header Create menu to planning records. Domain captures start in
 * their own workspace, where their evidence and record context are visible.
 */
export function createShortcuts(scope: Scope | undefined): CreateShortcut[] {
  if (!scope || !scope.permissions.includes('work.read') || !scope.permissions.includes('work.write')) return [];

  return [
    { area: 'work', label: 'Task', params: 'action=task' },
    { area: 'programs', label: 'Work program', params: 'action=create' },
  ];
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
  if (/^\/ops\/(intelligence|programs|work)(?:\/|$)/.test(pathname)) return scope.permissions.includes('work.read');
  if (/^\/ops\/(geology|field|pit)(?:\/|$)/.test(pathname)) return scope.permissions.includes('geo.read');
  if (/^\/ops\/plant(?:\/|$)/.test(pathname)) return scope.permissions.includes('plant.read');
  if (/^\/ops\/gold(?:\/|$)/.test(pathname)) return scope.permissions.includes('gold.read');
  return true;
}

/**
 * Finds a compatible local scope for a route. It is intentionally a selector,
 * not an authorisation bypass: callers still pass the chosen scope through the
 * same permission checks used everywhere else.
 */
export function scopeForOperationsPath(scopes: Scope[] | undefined, pathname: string, preferredScopeId?: string) {
  if (!scopes?.length) return undefined;
  const preferred = preferredScopeId ? scopes.find((scope) => scope.id === preferredScopeId) : undefined;
  const kind = requiredScopeKind(pathname);
  if (kind) {
    const compatible = scopes.filter((scope) => scope.kind === kind && supportsOperationsPath(scope, pathname));
    return compatible.find((scope) => scope.id === preferredScopeId) || compatible[0] || preferred || scopes[0];
  }
  if (preferred && supportsOperationsPath(preferred, pathname)) return preferred;
  return scopes.find((scope) => supportsOperationsPath(scope, pathname)) || scopes[0];
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
