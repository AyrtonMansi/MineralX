import type { Metadata } from 'next';
import { Suspense } from 'react';
import {headers} from 'next/headers';
import OperationsProvider from '@/components/ops/OperationsProvider';
import OperationsShell from '@/components/ops/OperationsShell';
import './operations.css';
export const metadata: Metadata = {title:'Operations',robots:{index:false,follow:false},alternates:{canonical:null}};
export default async function OperationsLayout({children}:{children:React.ReactNode}) {
 const development=(await headers()).get('x-mineralx-ops-mode')==='development';
 return <div data-mineralx-ops-mode={development?'development':'staff'}><Suspense fallback={<main className="ops-shell ops-loading" id="main-content"><h1>MineralX Operations</h1><p>Opening your workspace…</p></main>}><OperationsProvider development={development}><OperationsShell>{children}</OperationsShell></OperationsProvider></Suspense></div>;
}
