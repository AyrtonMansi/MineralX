'use client';

import { useState } from 'react';
import { downloadBlob } from '@/lib/ops/client';
import { developmentSession } from '@/lib/ops/development-policy';
import { zonedTimestamp } from '@/lib/ops/time';
import { useOperations } from './OperationsProvider';
import { Heading, LinkTo, Message, Quantity, useResource } from './primitives';

export default function Reports() {
  const { scope } = useOperations();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error: loadError } = useResource(scope ? `dashboard?scope=${scope.id}${range}` : null);

  const exportRows = async (kind: string) => {
    setBusy(true);
    setError('');
    try {
      if (developmentSession()) {
        const { developmentExport } = await import('@/lib/ops/development');
        downloadBlob(`MineralX-DEVELOPMENT-${kind}.${kind === 'geology' ? 'json' : 'csv'}`, await developmentExport(scope!.id, kind));
        return;
      }
      const response = await fetch(`/api/ops/export?scope=${scope!.id}&kind=${kind}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message || 'Export could not be confirmed.');
      }
      downloadBlob(`MineralX-${kind}-${new Date().toISOString().slice(0, 10)}.${kind === 'geology' ? 'json' : 'csv'}`, await response.blob());
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Heading title="Reports" description="Every figure retains its period, measurement basis and underlying record." />
    {(error || loadError) && <Message error>{error || loadError}</Message>}
    <section className="ops-card">
      <form className="ops-actions" onSubmit={(event) => {
        event.preventDefault();
        try {
          setError('');
          const start = zonedTimestamp(`${from}T00:00`, scope?.timezone);
          const end = zonedTimestamp(`${to}T00:00`, scope?.timezone);
          if (end <= start) throw new Error('The end must follow the start.');
          setRange(`&from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`);
        } catch (caught) {
          setError((caught as Error).message);
        }
      }}>
        <label>From (inclusive)<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label>
        <label>To (exclusive)<input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></label>
        <button>Apply reporting period</button>
      </form>
      <p className="ops-muted">{scope?.timezone}. Defaults to the last 30 days.</p>
    </section>
    {data && <>
      {!!data.productionBasisIssues && <Message error>{data.productionBasisIssues} recognised outputs have a held or changed measurement basis. Review those lots before relying on current production totals.</Message>}
      <div className="ops-kpis">
        {data.gold && <LinkTo area="gold" params="view=production"><span>Recognised fine Au</span><strong><Quantity value={data.gold.confirmed_fine_au_g} missing="None recognised" /></strong><small>{data.gold.confirmed_lots} source-linked lots</small></LinkTo>}
        {data.pending && <LinkTo area="gold" params="view=lots"><span>Pending physical output</span><strong>{data.pending.lots} <small>lots</small></strong><small>{data.pending.unweighed} unweighed</small></LinkTo>}
        {data.processing && <LinkTo area="plant" params="view=runs"><span>Dry-basis feed</span><strong><Quantity value={data.processing.dry_t} unit="t" /></strong><small>{data.processing.basis_incomplete} incomplete measurement bases</small></LinkTo>}
      </div>
      <section className="ops-card"><h2>Basis & completeness</h2><p>Period: {new Date(data.from).toLocaleString('en-AU', { timeZone: scope?.timezone })} to {new Date(data.to).toLocaleString('en-AU', { timeZone: scope?.timezone })} (exclusive).</p><p>Shared revision {data.revision}. Generated {new Date(data.asOf).toLocaleString('en-AU')}.</p><p>Recovery: {data.recoveryNote}</p><p className="ops-muted">Purity, product mass, recognised fine gold and custody are separate quantities. Unrecorded measurements are never inserted as zero.</p></section>
      {data.trend?.length > 0 && <section className="ops-card"><h2>Daily recognised production</h2><div className="ops-table-scroll"><table><thead><tr><th>Facility day</th><th>Fine Au</th><th>Underlying records</th></tr></thead><tbody>{data.trend.map((row: any) => <tr key={row.day}><td>{row.day}</td><td><Quantity value={row.fine_au_g} /></td><td><LinkTo area="gold" params="view=production">Production register</LinkTo></td></tr>)}</tbody></table></div></section>}
    </>}
    <section className="ops-card"><h2>Preserved accounts & source exports</h2><p>Closed reconciliation revisions are retained with their source observations. Register exports cover the whole selected workspace and identify their consistent shared revision; the summary date filter above does not narrow those exports.</p><div className="ops-actions">{scope?.permissions.includes('balance.read') && <LinkTo area="gold" params="view=periods">Open reconciliation accounts</LinkTo>}<button onClick={() => window.print()}>Print this report / save PDF</button>{scope?.permissions.includes('report.export') && [['runs', 'plant.read'], ['lots', 'gold.read'], ['production', 'gold.read'], ['periods', 'balance.read'], ['geology', 'geo.read']].filter(([, permission]) => scope.permissions.includes(permission)).map(([kind]) => <button key={kind} disabled={busy} onClick={() => exportRows(kind)}>Export {kind}</button>)}</div></section>
  </>;
}
