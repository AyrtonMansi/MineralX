import type { Metadata } from 'next';
import { Suspense } from 'react';
import OperationsProvider from '@/components/ops/OperationsProvider';
import OperationsShell from '@/components/ops/OperationsShell';
import './operations.css';
export const metadata: Metadata = {title:'Operations',robots:{index:false,follow:false},alternates:{canonical:null}};
export default function OperationsLayout({children}:{children:React.ReactNode}) {
 return <Suspense fallback={<main className="ops-shell ops-loading" id="main-content"><h1>MineralX Operations</h1><p>Opening your workspace…</p></main>}><OperationsProvider><OperationsShell>{children}</OperationsShell></OperationsProvider></Suspense>;
}
