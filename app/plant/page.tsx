import React from 'react';
import Link from 'next/link';
import { plantSchema } from '@/lib/plant/model';
import { PlantDashboard } from '@/components/plant/PlantDashboard';
import data from '@/data/plant-p5.json';

export default function PlantPage() {
  const model=plantSchema.parse(data);
  return <>
    <header className="plant-topbar">
      <Link href="/" className="plant-brand">MINERAL<span>X</span></Link>
      <span className="plant-workspace-name">Josephine <span>Plant review</span></span>
      <nav aria-label="Workspace">
        <Link href="/plant" aria-current="page">Plant plan</Link>
        <Link href="/gic">Gold production</Link>
      </nav>
    </header>
    <noscript><div className="plant-notice">The plan is visible below. Enable JavaScript to zoom, trace circuits and save review notes.</div></noscript>
    <PlantDashboard model={model} notesEndpoint="/api/plant/notes"/>
  </>;
}
