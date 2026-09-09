"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="plant-empty">
      <h1>The plant plan is temporarily unavailable</h1>
      <p>We could not confirm the latest result. Reopen the plan before retrying an action.</p>
      <button onClick={reset}>Try again</button>
      <a href="/gic">Open gold production</a>
    </main>
  );
}
