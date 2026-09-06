"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="plant-empty">
      <h1>The plant plan is temporarily unavailable</h1>
      <p>Your saved plan has not changed.</p>
      <button onClick={reset}>Try again</button>
      <a href="/gic">Open gold production</a>
    </main>
  );
}
