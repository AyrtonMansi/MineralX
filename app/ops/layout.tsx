import type {Metadata} from 'next';
import {Suspense} from 'react';
import OperationsProvider from '@/components/ops/OperationsProvider';
import OperationsShell from '@/components/ops/OperationsShell';
import '@/components/ops/operations.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Staff operations',robots:{index:false,follow:false},alternates:{canonical:null}};
export default function Layout({children}:{children:React.ReactNode}){return <Suspense fallback={<main className="ops-entry" id="main-content">Loading staff workspace…</main>}><OperationsProvider><OperationsShell>{children}</OperationsShell></OperationsProvider></Suspense>;}
