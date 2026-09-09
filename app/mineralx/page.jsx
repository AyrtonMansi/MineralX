'use client';
import '../../components/mineralx/mineralx.css';
import Link from 'next/link';
import MineralXWorkspace from '../../components/mineralx/MineralXWorkspace';

export default function MineralXPage() {
  return <><div className="mx-suite-notice"><strong>Geology Globe</strong> · Local geology records in this browser only. <Link href="/ops/geology">Open shared Exploration, programs & tasks →</Link> Export local records before migration; nothing is silently replaced.</div><MineralXWorkspace /></>;
}
