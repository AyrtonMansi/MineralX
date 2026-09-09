'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="ops-card" role="alert"><h1>This view could not open</h1><p>We could not confirm the latest result. Reopen the record before resubmitting an entry.</p><button onClick={reset}>Retry view</button><a href="/ops/field">Open field recovery</a></section>;}
