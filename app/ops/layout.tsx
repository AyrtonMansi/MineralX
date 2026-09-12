import type { Metadata } from 'next';
import { Suspense } from 'react';
import {headers} from 'next/headers';
import OperationsProvider from '@/components/ops/OperationsProvider';
import OperationsShell from '@/components/ops/OperationsShell';
import OperationsEntry from '@/components/ops/OperationsEntry';
import './operations.css';
import './operations-gic.css';
import './heading-compact.css';
import './fullscreen-enterprise.css';
import './engineering-workspace.css';
export const metadata: Metadata = {title:'Operations',robots:{index:false,follow:false},alternates:{canonical:null}};
export default async function OperationsLayout({children}:{children:React.ReactNode}) {
 const requestHeaders=await headers();
 // Meetings has its own verified private membership; it must not depend on browser-local Operations or an uncommissioned Operations schema.
 if(requestHeaders.get('x-mineralx-ops-section')==='meetings')return <div data-mineralx-ops-mode="staff"><Suspense fallback={<p>Opening Meetings…</p>}>{children}</Suspense></div>;
 if(requestHeaders.get('x-mineralx-ops-mode')==='chooser')return <div data-mineralx-ops-mode="chooser"><OperationsEntry/></div>;
 const development=requestHeaders.get('x-mineralx-ops-mode')==='development';
 return <div data-mineralx-ops-mode={development?'development':'staff'}><Suspense fallback={<main className="ops-shell ops-loading" id="main-content"><h1>MineralX Operations</h1><p>Opening your workspace…</p></main>}><OperationsProvider development={development}><OperationsShell>{children}</OperationsShell></OperationsProvider></Suspense></div>;
}
