"use client";
export default function GicError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="gic-login">
      <h1>We couldn’t load the workspace</h1>
      <p className="gic-muted">
        Please try again. If the issue continues, contact your MineralX
        administrator.
      </p>
      <button className="gic-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
