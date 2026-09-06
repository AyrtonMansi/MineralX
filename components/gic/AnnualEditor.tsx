"use client";
import { useState } from "react";
import { saveAnnual } from "@/app/gic/actions";
import {
  componentLabels,
  componentNames,
  displayDate,
  emptyAnnual,
  fields,
  fieldLabel,
  fineGold,
  fyLabel,
  grams,
  optionsFor,
  processingRows,
  rowIssues,
  type AnnualReport,
  type AnnualData,
  type Component,
  type ReturnRow,
  type Run,
} from "@/lib/gic/model";

const instructions: Record<Component, string> = {
  MINE_DETAILS:
    "Use the mine name registered in GSQ. Days of operation are operating days, not the number of processing runs. Enter waste rock or overburden separately.",
  TENEMENT_STATUS:
    "Include every mining lease within this reporting operation. Confirm its status for the selected year.",
  RAW_MATERIAL_MINED:
    "Record material mined during this year. Tonnes processed may come from older stockpiles and are not automatically tonnes mined.",
  RAW_MATERIAL_TRANSFERRED:
    "Record ownership or reporting-responsibility transfers. Temporary toll-processing movements with ownership retained are not transfers for this table.",
  RAW_COMMODITY_STOCKPILE:
    "Record closing raw-material stockpiles at 30 June, excluding run-of-mine material already scheduled for processing. Confirm a zero balance where applicable.",
  PRODUCTS_PROCESSED:
    "Gold production and input tonnes are drawn from the run register. Confirm the processor, original feed and reporting responsibility before export.",
  SALES:
    "Record actual sales in this year. Gold recovered is not automatically gold sold. Values are net invoiced AUD; Australian sales also need destination state and freight cost.",
};
export function AnnualEditor({
  report,
  runs,
  year,
  currentYear,
  mineName,
  writable,
  runsVersion,
}: {
  report: AnnualReport | null;
  runs: Run[];
  year: number;
  currentYear: number;
  mineName: string;
  writable: boolean;
  runsVersion: number;
}) {
  const initiallyStale = Boolean(report && report.runs_version !== runsVersion);
  const initialData = report?.data ?? emptyAnnual();
  const [data, setData] = useState<AnnualData>(() =>
    initiallyStale
      ? {
          ...initialData,
          checks: { ...initialData.checks, PRODUCTS_PROCESSED: false },
          coverage_confirmed: false,
        }
      : initialData,
  );
  const [version, setVersion] = useState(report?.version ?? 0);
  const [component, setComponent] = useState<Component>("PRODUCTS_PROCESSED");
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(initiallyStale);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedRunsVersion, setSavedRunsVersion] = useState(
    report?.runs_version ?? runsVersion,
  );
  const active = runs.filter((r) => r.data.status === "active");
  const rows =
    component === "PRODUCTS_PROCESSED"
      ? processingRows(runs, data, mineName)
      : (data.rows[component] ?? []);
  const issues = rows.flatMap((r, i) =>
    rowIssues(component, r, year).map((v) => `Row ${i + 1}: ${v}`),
  );
  if (component === "MINE_DETAILS" && rows.length !== 1)
    issues.push("Add one mine-details row.");
  if (component === "TENEMENT_STATUS" && !rows.length)
    issues.push("Add the mining leases in this operation.");
  const runsChanged = savedRunsVersion !== runsVersion;
  const canExport =
    !dirty &&
    !runsChanged &&
    Boolean(data.checks[component]) &&
    data.coverage_confirmed &&
    rows.length > 0 &&
    issues.length === 0;
  const change = (next: AnnualData) => {
    setData(next);
    setDirty(true);
    setMessage("");
    setError("");
  };
  const updateRow = (index: number, key: string, value: string) => {
    const nextRows = [...(data.rows[component] ?? [])];
    nextRows[index] = { ...nextRows[index], [key]: value };
    change({
      ...data,
      rows: { ...data.rows, [component]: nextRows },
      checks: { ...data.checks, [component]: false },
    });
  };
  const renderField = (
    field: { key: string; type: string; required: boolean },
    row: ReturnRow,
    i: number,
  ) => {
    const opts = optionsFor(field.key);
    return (
      <label key={field.key}>
        {fieldLabel(field.key)}
        {field.required ? " *" : ""}
        {opts ? (
          <select
            value={row[field.key] ?? ""}
            onChange={(e) => updateRow(i, field.key, e.target.value)}
          >
            <option value="">Select…</option>
            {opts.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ) : (
          <input
            type={
              field.type === "date"
                ? "date"
                : field.type === "number"
                  ? "number"
                  : "text"
            }
            min={field.type === "number" ? 0 : undefined}
            step={field.type === "number" ? "any" : undefined}
            maxLength={2000}
            value={row[field.key] ?? ""}
            onChange={(e) => updateRow(i, field.key, e.target.value)}
          />
        )}
      </label>
    );
  };
  return (
    <>
      <div className="gic-pagehead">
        <div>
          <h1>Annual reporting</h1>
          <p className="gic-muted">
            1 July {year - 1} – 30 June {year} · Working draft
          </p>
        </div>
        <form
          className="gic-report-period"
          onSubmit={(e) => {
            if (dirty && !window.confirm("Leave without saving these changes?"))
              e.preventDefault();
          }}
        >
          <label>
            <span className="sr-only">Financial year</span>
            <select name="year" defaultValue={year}>
              {Array.from(
                { length: currentYear - 1999 },
                (_, i) => currentYear - i,
              ).map((y) => (
                <option key={y} value={y}>
                  FY {fyLabel(y)}
                </option>
              ))}
            </select>
          </label>
          <button className="gic-button">View</button>
        </form>
      </div>
      <p className="gic-caption gic-stats-note">
        Standard deadline: 30 September {year}. Check GSQ guidance for
        non-business-day changes.
      </p>
      <div className="gic-stats">
        <div>
          <span>Gold weight recovered</span>
          <p>
            {grams(active.reduce((s, r) => s + r.data.gross_grams, 0))}{" "}
            <small>g</small>
          </p>
        </div>
        <div>
          <span>Contained gold</span>
          <p>
            {grams(active.reduce((s, r) => s + fineGold(r.data), 0))}{" "}
            <small>g</small>
          </p>
        </div>
        <div>
          <span>Tonnes input</span>
          <p>
            {grams(active.reduce((s, r) => s + r.data.feed_tonnes, 0))}{" "}
            <small>t</small>
          </p>
        </div>
        <div>
          <span>Runs in period</span>
          <p>{active.length}</p>
        </div>
      </div>
      <p className="gic-notice">
        Check the full year’s coverage before using these figures. No recorded
        runs does not establish a nil return. The annual return is lodged
        separately through GSQ.
      </p>
      {runsChanged && (
        <p role="status" className="gic-notice">
          Processing records changed after this draft was saved. Recheck the
          figures and save the draft before exporting.
        </p>
      )}
      <div
        className="gic-report-tabs"
        role="group"
        aria-label="Return components"
      >
        {componentNames.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={component === c}
            onClick={() => setComponent(c)}
          >
            {componentLabels[c]} {data.checks[c] ? "✓" : ""}
          </button>
        ))}
      </div>
      <fieldset disabled={!writable || pending}>
        <legend className="sr-only">Annual return draft</legend>
        <section className="gic-panel">
          <div className="gic-report-sectionhead">
            <h2>{componentLabels[component]}</h2>
            <span className="gic-caption">
              {component.replaceAll("_", " ")}
            </span>
          </div>
          <p className="gic-muted">{instructions[component]}</p>
          {component === "PRODUCTS_PROCESSED" ? (
            <>
              <div className="gic-fields two">
                {renderField(
                  { key: "INPUT_MATERIAL", type: "text", required: true },
                  {
                    INPUT_MATERIAL:
                      data.rows.PRODUCTS_PROCESSED?.[0]?.INPUT_MATERIAL || "",
                  },
                  0,
                )}
                {renderField(
                  { key: "PROCESSOR", type: "text", required: true },
                  {
                    PROCESSOR:
                      data.rows.PRODUCTS_PROCESSED?.[0]?.PROCESSOR || mineName,
                  },
                  0,
                )}
                <label>
                  Annual gold recovery · %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={data.rows.PRODUCTS_PROCESSED?.[0]?.RECOVERY ?? ""}
                    onChange={(e) => updateRow(0, "RECOVERY", e.target.value)}
                  />
                  <span className="gic-caption">
                    Required by the return. Use a reconciled whole percentage.
                    This cannot be calculated from bullion purity alone; leave
                    blank until known.
                  </span>
                </label>
              </div>
              <p className="gic-caption">
                Gravity Concentrate · Bullion · Gold (Au). Original input tonnes
                are rounded to whole tonnes for the official export; the run
                register retains your precision.
              </p>
              {active.length === 0 && (
                <p className="gic-muted">
                  No processing runs recorded for this period.
                </p>
              )}
            </>
          ) : (
            <>
              {rows.map((row, i) => (
                <details
                  className="gic-report-row"
                  key={`${component}-${i}`}
                  open={rows.length === 1}
                >
                  <summary>
                    Row {i + 1}
                    {row.MINE_NAME
                      ? ` · ${row.MINE_NAME}`
                      : row.TENEMENT_NO
                        ? ` · ML ${row.TENEMENT_NO}`
                        : ""}
                  </summary>
                  <div className="gic-fields two">
                    {fields[component].map((f) => renderField(f, row, i))}
                  </div>
                  <button
                    type="button"
                    className="gic-small-button"
                    onClick={() =>
                      change({
                        ...data,
                        rows: {
                          ...data.rows,
                          [component]: rows.filter((_, n) => n !== i),
                        },
                        checks: { ...data.checks, [component]: false },
                      })
                    }
                  >
                    Remove draft row
                  </button>
                </details>
              ))}
              <button
                type="button"
                className="gic-button"
                disabled={component === "MINE_DETAILS" && rows.length > 0}
                onClick={() =>
                  change({
                    ...data,
                    rows: {
                      ...data.rows,
                      [component]: [
                        ...rows,
                        component === "MINE_DETAILS"
                          ? { MINE_NAME: mineName, PERIOD_END: `${year}-06-30` }
                          : component === "TENEMENT_STATUS"
                            ? { TENEMENT_TYPE: "ML" }
                            : {},
                      ],
                    },
                    checks: { ...data.checks, [component]: false },
                  })
                }
              >
                + Add row
              </button>
            </>
          )}
          {issues.length > 0 && (
            <details className="gic-report-row">
              <summary>
                {issues.length} item{issues.length === 1 ? "" : "s"} to complete
                before export
              </summary>
              <ul className="gic-report-errors">
                {issues.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </details>
          )}
          <label className="gic-check">
            <input
              type="checkbox"
              checked={data.checks[component] ?? false}
              onChange={(e) =>
                change({
                  ...data,
                  checks: { ...data.checks, [component]: e.target.checked },
                })
              }
            />
            {component === "PRODUCTS_PROCESSED"
              ? "I reviewed the figures, original feed, final product and this operation’s reporting responsibility."
              : "I reviewed this component, including whether any nil or not-applicable entries are needed."}
          </label>
        </section>
        <section className="gic-panel">
          <h2>Year-end review</h2>
          <label className="gic-check">
            <input
              type="checkbox"
              checked={data.coverage_confirmed}
              onChange={(e) =>
                change({ ...data, coverage_confirmed: e.target.checked })
              }
            />
            I have checked that the records cover the entire reporting year.
          </label>
          <div className="gic-checklist">
            {componentNames.map((c) => (
              <p key={c} className="gic-caption">
                {data.checks[c] ? "✓ Reviewed" : "○ To review"} ·{" "}
                {componentLabels[c]}
              </p>
            ))}
          </div>
          <label>
            Reporting notes
            <textarea
              rows={3}
              maxLength={4000}
              value={data.notes}
              onChange={(e) => change({ ...data, notes: e.target.value })}
              placeholder="Outstanding information or instructions for your reporting adviser"
            />
          </label>
          <details>
            <summary>Lodgement record</summary>
            <p className="gic-caption">
              Enter these only after the return has actually been lodged. Saving
              here does not submit it.
            </p>
            <div className="gic-fields two">
              <label>
                Date lodged
                <input
                  type="date"
                  value={data.lodgement_date}
                  onChange={(e) =>
                    change({ ...data, lodgement_date: e.target.value })
                  }
                />
              </label>
              <label>
                GSQ receipt / lodgement reference
                <input
                  maxLength={200}
                  value={data.lodgement_reference}
                  onChange={(e) =>
                    change({ ...data, lodgement_reference: e.target.value })
                  }
                />
              </label>
            </div>
          </details>
        </section>
        {error && (
          <p role="alert" className="gic-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="gic-success">
            {message}
          </p>
        )}
        <div className="gic-form-actions">
          <button
            type="button"
            className="gic-button primary"
            disabled={pending || !dirty}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                const result = await saveAnnual(
                  data,
                  year,
                  version,
                  runsVersion,
                );
                if (result.error) setError(result.error);
                else {
                  setVersion(result.version!);
                  setDirty(false);
                  setSavedRunsVersion(runsVersion);
                  setMessage("Annual draft saved.");
                }
              } catch {
                setError("Could not save. Your entries are still here.");
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Saving…" : "Save annual draft"}
          </button>
        </div>
      </fieldset>
      <div className="gic-inline-actions">
        {canExport ? (
          <a
            className="gic-button"
            href={`/gic/export?kind=return&year=${year}&component=${component}`}
          >
            Export {componentLabels[component].toLowerCase()} CSV
          </a>
        ) : (
          <span className="gic-caption">
            Complete the selected component, review coverage and save to enable
            its CSV export.
          </span>
        )}
        <a className="gic-button" href={`/gic/export?kind=runs&year=${year}`}>
          Export supporting run register
        </a>
      </div>
      <p className="gic-report-source">
        Mapped to the Queensland minerals annual-return template v1.8, June
        2026.{" "}
        <a
          href="https://www.business.qld.gov.au/industries/mining-energy-water/resources/minerals-coal/reports-notices/returns"
          target="_blank"
          rel="noreferrer"
        >
          Official template and lodgement guidance ↗
        </a>
        . Review other commodities separately if applicable. This workspace
        assists preparation; it does not certify compliance or calculate
        royalties.
      </p>
    </>
  );
}
