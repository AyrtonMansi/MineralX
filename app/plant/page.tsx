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
      <span className="plant-workspace-name">Josephine <span>Plant layout reference</span></span>
      <nav aria-label="Workspace">
        <Link href="/plant" aria-current="page">Layout reference</Link>
        <Link href="/ops">MineralX workspaces</Link>
        <Link href="/gic">Gold production</Link>
      </nav>
    </header>
    <div className="plant-notice">Read-only engineering reference. Controlled plant records and review decisions belong in an authorised MineralX workspace.</div>
    <noscript><div className="plant-notice">The plan is visible below. Enable JavaScript to zoom and trace circuits.</div></noscript>
    <PlantDashboard model={model} readOnly/>
  </>;
}
