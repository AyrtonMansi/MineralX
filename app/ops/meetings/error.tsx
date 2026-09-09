'use client';

export default function MeetingsError({ reset }: { reset: () => void }) {
  return <main className="ops-shell mt-shell mt-main" id="main-content"><section className="ops-card" role="alert"><p className="ops-eyebrow">PRIVATE JV WORKSPACE</p><h1>Meetings could not open.</h1><p>We could not confirm the latest result. Reopen the meeting before importing or reviewing anything again.</p><div className="ops-actions"><button className="ops-primary" onClick={reset}>Retry meetings</button><a href="/ops/login?next=/ops/meetings">Sign in again</a></div></section></main>;
}
