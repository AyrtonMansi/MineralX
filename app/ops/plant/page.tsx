import { redirect } from 'next/navigation';
import PlantWorkspace from '@/components/ops/PlantWorkspace';

const goldViews = new Set(['lots', 'custody', 'periods', 'production', 'allocations', 'settlements']);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const view = typeof values.view === 'string' ? values.view : '';
  // The former processing-program register is now the canonical Programs
  // workspace. Preserve old URLs and IDs without keeping a second entry
  // point for the same record.
  if (view === 'campaigns' || values.action === 'campaign') {
    const query = new URLSearchParams();
    for (const key of ['scope', 'item', 'mode']) if (typeof values[key] === 'string') query.set(key, values[key]);
    if (values.action === 'campaign') {
      query.set('action', 'create');
      query.set('type', 'processing');
    }
    redirect(`/ops/programs?${query.toString()}`);
  }
  if (goldViews.has(view)) {
    const query = new URLSearchParams();
    for (const key of ['scope', 'view', 'item', 'mode']) if (typeof values[key] === 'string') query.set(key, values[key]);
    if (view === 'lots' && values.action === 'cleanup') query.set('action', 'cleanup');
    redirect(`/ops/gold?${query.toString()}`);
  }
  return <PlantWorkspace />;
}
