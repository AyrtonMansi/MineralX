'use client';

import Link from 'next/link';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en-AU"><body><main id="main-content" style={{ maxWidth: 720, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}><p style={{ letterSpacing: '0.12em', fontSize: 12, textTransform: 'uppercase' }}>MineralX</p><h1>We could not open this page.</h1><p>We could not confirm the latest result. Reopen the record before retrying an action.</p><p><button onClick={reset}>Retry</button> <Link href="/">Return to MineralX</Link></p></main></body></html>;
}
