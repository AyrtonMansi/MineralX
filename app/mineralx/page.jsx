'use client';
import '../../components/mineralx/mineralx.css';
import Link from 'next/link';
import MineralXWorkspace from '../../components/mineralx/MineralXWorkspace';

export default function MineralXPage() {
  return <><div className="mx-suite-notice">Local geology records · this browser only. <Link href="/ops/geology?view=map">Open the suite Geology Globe, shared programs & tasks →</Link> Export local records before migration; nothing is silently replaced.</div><MineralXWorkspace /></>;
}
