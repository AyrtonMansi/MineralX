'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, downloadBlob } from '@/lib/ops/client';
import { OPS_RELEASE } from '@/lib/ops/contracts';
import {
  isCurrentOperationsArea,
  navigationGroups,
  operationsHref,
  createShortcuts,
  scopeForOperationsPath,
  scopeLabel,
  type OperationsArea,
} from '@/lib/ops/suite-navigation';
import { developmentPage } from '@/lib/ops/development-policy';
import { mayNavigate } from './navigation';
import { useOperations } from './OperationsProvider';
import { Message, Status } from './primitives';

function resultArea(kind: string): OperationsArea {
  if (kind === 'programs' || kind === 'work') return kind;
  if (['samples', 'collars', 'dispatches', 'assayBatches'].includes(kind)) return 'geology';
  if (['lots', 'custody', 'production', 'periods', 'allocations', 'settlements'].includes(kind)) return 'gold';
  return 'plant';
}

const FOCUSABLE_IN_DRAWER = 'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function drawerFocusables(drawer: HTMLElement) {
  return Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_IN_DRAWER)).filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true' && style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export default function OperationsShell({ children }: { children: React.ReactNode }) {
  const {
    development,
    context,
    scope,
    loading,
    failure,
    online,
    offlineMode,
    pack,
    saveState,
    syncing,
    sync,
    selectScope,
    refresh,
    exportVault,
  } = useOperations();
  const path = usePathname();
  const router = useRouter();
  const urlQuery = useSearchParams();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const menuWasOpen = useRef(false);
  const groups = navigationGroups(scope, development ? { development: true, scopes: context?.scopes } : undefined);
  const createItems = createShortcuts(scope);
  const deviceQuery = new URLSearchParams(urlQuery.toString());
  deviceQuery.set('mode', 'development');
  const deviceHref = `${path}?${deviceQuery.toString()}`;
  const href = (area: OperationsArea = '', params = '') => {
    const destination = development
      ? scopeForOperationsPath(context?.scopes, area ? `/ops/${area}` : '/ops', scope?.id)
      : scope;
    return operationsHref(area, destination?.id, params);
  };
  const isCurrentItem = (item: { area: OperationsArea; label: string; href?: string; params?: string }) => {
    if (item.href) return path === item.href;
    if (item.label === 'People & workload') return path === '/ops/work' && urlQuery.get('view') === 'people';
    if (item.area === 'work') return path === '/ops/work' && urlQuery.get('view') !== 'people';
    if (item.area === 'geology') return path === '/ops/geology';
    return isCurrentOperationsArea(path, item.area);
  };

  useEffect(() => {
    if (!menu) {
      if (!menuWasOpen.current) return;
      menuWasOpen.current = false;
      const frame = requestAnimationFrame(() => menuButton.current?.focus());
      return () => cancelAnimationFrame(frame);
    }

    menuWasOpen.current = true;
    const background = [
      header.current,
      content.current,
      ...Array.from(document.querySelectorAll<HTMLElement>('.skip-link')),
    ].filter((element): element is HTMLElement => Boolean(element));
    const previous = background.map((element) => ({
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }));
    background.forEach((element) => {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });
    return () => background.forEach((element, index) => {
      const original = previous[index];
      if (original.inert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
      if (original.ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', original.ariaHidden);
    });
  }, [menu]);

  useEffect(() => {
    if (!development || !context || !scope || !['/ops/admin', '/ops/field'].includes(path)) return;
    const params = new URLSearchParams();
    if (urlQuery.get('mode') === 'development') params.set('mode', 'development');
    router.replace(operationsHref('', scope.id, params));
  }, [context, development, path, router, scope, urlQuery]);

  useEffect(() => {
    if (!menu) return;
    const dialog = drawer.current;
    if (!dialog) return;

    const focusInitialControl = () => {
      const focusable = drawerFocusables(dialog);
      const initial = focusable.find((element) => element === closeButton.current) || focusable[0] || dialog;
      initial.focus({ preventScroll: true });
    };
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = drawerFocusables(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    const frame = requestAnimationFrame(focusInitialControl);
    document.addEventListener('keydown', trapFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', trapFocus);
    };
  }, [menu]);

  if (path.startsWith('/ops/auth/')) {
    return <main className="ops-shell ops-field-unlock" id="main-content">{children}</main>;
  }
  if (path === '/ops/login') {
    return <div className="ops-shell ops-field-unlock">{children}</div>;
  }
  if (!context && (path === '/ops/field' || path === '/ops/account')) {
    return <main className="ops-shell ops-field-unlock" id="main-content">{children}</main>;
  }
  if (loading && !context) {
    return <main className="ops-shell ops-loading" id="main-content"><h1>MineralX Operations</h1><p role="status">{development ? 'Opening the device workspace on this browser…' : 'Checking your named account and assigned workspaces…'}</p></main>;
  }
  if (!context) {
    return <main className="ops-shell ops-entry" id="main-content">
      <p className="ops-eyebrow">MineralX / staff portal</p>
      <h1>Open the right workspace for the work.</h1>
      <p>Shared Operations, private JV meetings and local device tools have separate access and data boundaries.</p>
      {failure && <Message error>{failure.message}</Message>}
      {development && <p>Device mode does not need a login. Its records remain on this browser until you export a recovery copy.</p>}
      <div className="ops-actions"><a className="ops-primary" href="/ops/login">Staff sign in</a><a href="/ops/meetings">Open private JV meetings</a><Link href="/ops/field">Unlock prepared field records</Link><button onClick={() => { if (mayNavigate()) void refresh(); }}>Check access again</button></div>
      <hr />
      {developmentPage(path, 'development') && <p><a className="ops-primary" href={deviceHref}>Open device workspace</a><br /><small>Local pit, exploration and planning tools. Private meeting notes still need verified sign-in.</small></p>}
    </main>;
  }

  if (development && ['/ops/admin', '/ops/field'].includes(path)) {
    return <main className="ops-shell ops-loading" id="main-content"><p role="status">Opening the Development workspace…</p></main>;
  }

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      setError('Enter at least two characters to search this workspace.');
      return;
    }
    if (!scope) return;
    try {
      setError('');
      const [legacy, work] = await Promise.all([
        api<any[]>(`search?scope=${scope.id}&q=${encodeURIComponent(term)}`),
        api<any>(`workflow?scope=${scope.id}`).catch(() => null),
      ]);
      const lower = term.toLowerCase();
      const extra = [
        ...(work?.programs || []).filter((program: any) => String(program.data.name).toLowerCase().includes(lower)).map((program: any) => ({ id: program.id, kind: 'programs', label: program.data.name, status: program.data.state })),
        ...(work?.tasks || []).filter((task: any) => task.title.toLowerCase().includes(lower)).map((task: any) => ({ id: task.id, kind: 'work', label: task.title, status: task.status })),
      ];
      setMatches([...extra, ...legacy]);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const downloadDevelopmentBackup = async () => {
    setBackupBusy(true);
    setError('');
    try {
      const { developmentBackup } = await import('@/lib/ops/development');
      downloadBlob(`MineralX-DEVELOPMENT-${new Date().toISOString().slice(0, 10)}.tgz`, await developmentBackup());
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBackupBusy(false);
    }
  };

  return <div className="ops-shell">
    <header className="ops-topbar" ref={header}>
      <Link href={href()} className="ops-brand">MINERAL<span>X</span><small>OPERATIONS</small></Link>
      <button ref={menuButton} className="ops-mobile-menu" aria-controls="operations-navigation" aria-expanded={menu} onClick={() => setMenu((open) => !open)}>Menu</button>
      {!development && <label className="ops-scope"><span>Workspace / site</span><select aria-label="Workspace or site" value={scope?.id || ''} onChange={(event) => selectScope(event.target.value)}>{context.scopes.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.kind}</option>)}</select></label>}
      <form className="ops-search" onSubmit={search}><label className="ops-sr-only" htmlFor="ops-search">Find a program, task or record</label><input id="ops-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find programs, tasks or records" minLength={2} /><button type="submit">Find</button></form>
      {createItems.length > 0 && <details className="ops-create-menu"><summary>Create</summary><div>{createItems.map((item) => <Link key={`${item.area}:${item.params}`} href={href(item.area, item.params)}>{item.label}</Link>)}</div></details>}
      <a href="/ops/login">{development ? 'Staff sign-in' : 'Switch account'}</a>
      {!development && <Link href={href('account')}>Account{context.aal === 'aal2' ? ' · verified' : ''}</Link>}
    </header>
    {menu && <button className="ops-nav-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={() => setMenu(false)} />}
    <aside ref={drawer} className={`ops-sidebar ${menu ? 'is-open' : ''}`} id="operations-navigation" role={menu ? 'dialog' : undefined} aria-modal={menu || undefined} aria-label={menu ? 'Operations navigation' : undefined} tabIndex={menu ? -1 : undefined}>
      <nav aria-label="Operations">
        <div className="ops-nav-mobile-heading"><span>Navigation</span><button ref={closeButton} type="button" onClick={() => setMenu(false)}>Close</button></div>
        {groups.map((group) => <section className="ops-nav-group" key={group.label}><span className="ops-nav-caption">{group.label}</span>{group.items.map((item) => <Link key={`${group.label}:${item.area}:${item.label}`} href={item.href || (item.label === 'People & workload' ? href('work', 'view=people') : href(item.area, item.params))} aria-current={isCurrentItem(item) ? 'page' : undefined} onClick={() => setMenu(false)}>{item.label}</Link>)}</section>)}
        <section className="ops-nav-group"><span className="ops-nav-caption">Private records</span><a href="/ops/meetings" aria-label="Meetings" aria-current={path === '/ops/meetings' ? 'page' : undefined} onClick={() => setMenu(false)}>Meetings<small aria-hidden="true">Verified JV access</small></a></section>
        {!development && context.organisations.some((organisation) => organisation.admin) && <section className="ops-nav-group ops-nav-utility"><span className="ops-nav-caption">Other tools</span><Link href={href('admin')} onClick={() => setMenu(false)}>Access & settings</Link></section>}
      </nav>
      <footer><span>Release {OPS_RELEASE}</span><span>{development ? 'Device workspace · browser-local records' : 'Named access · source-linked records'}</span></footer>
    </aside>
    <div className="ops-content" ref={content}>
      <div className="ops-connection" aria-live="polite"><Status tone={offlineMode || !online ? 'warning' : 'neutral'}>{development ? 'Device workspace · saved on this browser' : offlineMode || !online ? 'Offline · device records only' : 'Connected to MineralX'}</Status>{saveState && <span>{saveState}</span>}<button disabled={loading || !online} onClick={() => { if (mayNavigate()) void refresh(); }}>Refresh records</button>{development && <button onClick={() => void downloadDevelopmentBackup()} disabled={backupBusy}>{backupBusy ? 'Preparing backup…' : 'Download device backup'}</button>}{pack && <><span>{pack.outbox.length} pending</span><button disabled={!online || syncing} onClick={() => sync().catch((caught) => setError(caught.message))}>{syncing ? 'Synchronising…' : 'Sync now'}</button><button onClick={async () => { const envelope = await exportVault(); if (envelope) downloadBlob('MineralX-encrypted-field-recovery.json', JSON.stringify(envelope)); }}>Recovery copy</button></>}</div>
      {failure && <Message error>{failure.message}</Message>}
      {error && <Message error>{error}<button onClick={() => setError('')}>Dismiss</button></Message>}
      {matches && <section className="ops-search-results" aria-label="Search results"><h2>Search results</h2><button onClick={() => setMatches(null)}>Close results</button>{matches.length ? matches.map((result) => { const area = resultArea(result.kind); return <Link key={`${result.kind}:${result.id}`} href={href(area, `view=${encodeURIComponent(result.kind)}&item=${encodeURIComponent(result.id)}`)} onClick={() => setMatches(null)}>{result.label} <small>{result.kind} · {result.status}</small></Link>; }) : <p>No matching records in this authorised workspace.</p>}</section>}
      <main id="main-content" key={`${context.userId}:${scope?.id || 'none'}`}>{children}</main>
      <footer className="ops-footnote">{scopeLabel(scope, development)} · {scope?.timezone || 'Australia/Brisbane'} · {development ? 'Device workspace only — not production records.' : offlineMode ? 'Not a live authorisation. Queued work is checked again on reconnection.' : 'Shared records use current account permissions.'}</footer>
    </div>
  </div>;
}
