'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="ops-card" role="alert"><h1>This view could not open</h1><p>Your committed records and encrypted device workspace are retained. Retry the view before resubmitting an entry.</p><button onClick={reset}>Retry view</button><a href="/ops/field">Open field recovery</a></section>;}
