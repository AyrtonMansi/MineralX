"use client";
import Link from "next/link";
import { useState } from "react";
import {
  displayDate,
  financialYear,
  fineGold,
  fyLabel,
  grams,
  type Run,
} from "@/lib/gic/model";
export function RunRegister({
  runs,
  writable,
  currentYear,
}: {
  runs: Run[];
  writable: boolean;
  currentYear: number;
}) {
  const [year, setYear] = useState(String(currentYear));
  const [search, setSearch] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const years = [
    ...new Set([
      currentYear,
      currentYear - 1,
      currentYear - 2,
      ...runs.map((r) => financialYear(r.data.processed_at)),
    ]),
  ].sort((a, b) => b - a);
  const visible = runs.filter(
    (r) =>
      (year === "all" || financialYear(r.data.processed_at) === Number(year)) &&
      (showVoided || r.data.status !== "void") &&
      `${r.data.reference} ${r.data.notes}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const final = visible.filter((r) => r.data.status === "active");
  const fine = final.reduce((s, r) => s + fineGold(r.data), 0);
  const gross = final.reduce((s, r) => s + r.data.gross_grams, 0);
  const tonnes = final.reduce((s, r) => s + r.data.feed_tonnes, 0);
  return (
    <>
      <div className="gic-pagehead">
        <div>
          <h1>Processing runs</h1>
          <p className="gic-muted">A clear record of every run.</p>
        </div>
        {writable && (
          <Link className="gic-button primary" href="/gic/runs/new">
            + New run
          </Link>
        )}
      </div>
      <div className="gic-stats">
        <div>
          <span>Contained gold</span>
          <p>
            {grams(fine)} <small>g</small>
          </p>
        </div>
        <div>
          <span>Gold weight recovered</span>
          <p>
            {grams(gross)} <small>g</small>
          </p>
        </div>
        <div>
          <span>Runs</span>
          <p>{final.length}</p>
        </div>
        <div>
          <span>Tonnes input</span>
          <p>
            {grams(tonnes)} <small>t</small>
          </p>
        </div>
      </div>
      <p className="gic-caption gic-stats-note">
        Gravity processing · Totals follow your filters. Voided runs are
        excluded.
      </p>
      <div className="gic-toolbar">
        <label className="gic-search">
          <span className="sr-only">Search processing runs</span>
          <input
            type="search"
            placeholder="Search runs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Financial year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All financial years</option>
            {years.map((y) => (
              <option value={y} key={y}>
                FY {fyLabel(y)}
              </option>
            ))}
          </select>
        </label>
        <label className="gic-check">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
          />
          Show voided
        </label>
        <a
          className="gic-button"
          href={`/gic/export?kind=runs&year=${year}&search=${encodeURIComponent(search)}&voided=${showVoided ? "1" : "0"}`}
        >
          Export CSV
        </a>
      </div>
      {visible.length === 0 ? (
        <div className="gic-empty">
          <span className="gic-empty-mark">＋</span>
          <h2>
            {runs.length
              ? "No runs match these filters"
              : "Your first run starts here"}
          </h2>
          <p className="gic-muted">
            {runs.length
              ? "Try another period or search term."
              : "Enter the recovered bullion weight, gold percentage, tonnes input and timestamp."}
          </p>
          {writable && !runs.length && (
            <Link href="/gic/runs/new" className="gic-button">
              Record a run
            </Link>
          )}
        </div>
      ) : (
        <div className="gic-table-wrap">
          <table>
            <caption className="sr-only">
              Processing runs in the selected period
            </caption>
            <thead>
              <tr>
                <th>Run</th>
                <th>Processed · AEST</th>
                <th className="number">Weight</th>
                <th className="number">Gold</th>
                <th className="number">Contained gold</th>
                <th className="number">Input</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/gic/runs/${r.id}`} className="gic-run-link">
                      {r.data.reference}
                    </Link>
                  </td>
                  <td>{displayDate(r.data.processed_at)}</td>
                  <td className="number">{grams(r.data.gross_grams)} g</td>
                  <td className="number">{grams(r.data.gold_percent)}%</td>
                  <td className="number">{grams(fineGold(r.data))} g</td>
                  <td className="number">
                    {grams(r.data.feed_tonnes)} t
                    {r.data.status === "void" && (
                      <span className="gic-cell-note">Voided</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
