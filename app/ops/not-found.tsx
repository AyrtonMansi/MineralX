import Link from 'next/link';

export default function OperationsNotFound() {
  return <section className="ops-card"><p className="ops-eyebrow">OPERATIONS / PAGE NOT FOUND</p><h1>This workspace page is unavailable.</h1><p>The page may have moved, or your current account may not have the required workspace access.</p><div className="ops-actions"><Link className="ops-primary" href="/ops">Choose a workspace</Link><a href="/ops/meetings">Open private meetings</a><Link href="/ops/field">Field recovery</Link></div></section>;
}
