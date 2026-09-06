"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRun } from "@/app/gic/actions";
import { grams, localInput, type Run, type RunInput } from "@/lib/gic/model";
export function RunForm({
  id,
  run,
  now,
}: {
  id: string;
  run?: Run;
  now: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [weight, setWeight] = useState(String(run?.data.gross_grams ?? ""));
  const [purity, setPurity] = useState(String(run?.data.gold_percent ?? ""));
  const fine =
    weight !== "" && purity !== ""
      ? (Number(weight) * Number(purity)) / 100
      : null;
  const reference =
    run?.data.reference ??
    `GIC-${now.slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
  return (
    <>
      <Link href={run ? `/gic/runs/${id}` : "/gic"} className="gic-back">
        ← {run ? "Run details" : "Processing runs"}
      </Link>
      <div className="gic-pagehead">
        <div>
          <h1>{run ? "Correct run" : "New processing run"}</h1>
          <p className="gic-muted">Gravity plant · {reference}</p>
        </div>
      </div>
      <form
        className="gic-run-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError("");
          const f = new FormData(e.currentTarget);
          const s = (k: string) => String(f.get(k) ?? "");
          const data: RunInput = {
            reference,
            processed_at: `${s("processed_at")}:00+10:00`,
            gross_grams: Number(s("gross_grams")),
            gold_percent: Number(s("gold_percent")),
            feed_tonnes: Number(s("feed_tonnes")),
            notes: s("notes"),
            status: (s("status") || "active") as RunInput["status"],
          };
          try {
            const result = await saveRun(
              data,
              id,
              run?.version ?? 0,
              s("reason"),
            );
            if (result.error) setError(result.error);
            else {
              router.push(`/gic/runs/${id}`);
              router.refresh();
            }
          } catch {
            setError(
              "Could not save. Your entries are still here. Check your connection and try again.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <fieldset disabled={pending}>
          <legend className="sr-only">Processing run</legend>
          <div className="gic-panel">
            <div className="gic-fields two">
              <label>
                Gold weight recovered · g
                <input
                  name="gross_grams"
                  type="number"
                  required
                  min="0"
                  max="9999999999"
                  step="any"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  autoFocus
                />
                <span className="gic-caption">
                  Total weight of the recovered bullion.
                </span>
              </label>
              <label>
                Gold percentage of bullion · %
                <input
                  name="gold_percent"
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="any"
                  inputMode="decimal"
                  value={purity}
                  onChange={(e) => setPurity(e.target.value)}
                />
              </label>
              <label>
                Tonnes input · t
                <input
                  name="feed_tonnes"
                  type="number"
                  required
                  min="0"
                  max="9999999999"
                  step="any"
                  inputMode="decimal"
                  defaultValue={run?.data.feed_tonnes ?? ""}
                />
              </label>
              <label>
                Processing timestamp · AEST
                <input
                  name="processed_at"
                  type="datetime-local"
                  required
                  defaultValue={localInput(run?.data.processed_at ?? now)}
                  max={localInput(now)}
                />
                <span className="gic-caption">Queensland time · UTC+10</span>
              </label>
            </div>
            <div className="gic-calculation">
              <span>Contained gold</span>
              <output aria-live="polite">
                {fine === null || !Number.isFinite(fine)
                  ? "—"
                  : `${grams(fine)} g`}
              </output>
              <span className="gic-caption">
                Recovered bullion weight × gold percentage ÷ 100
              </span>
            </div>
            <details>
              <summary>Optional notes</summary>
              <label>
                <span className="sr-only">Notes</span>
                <textarea
                  name="notes"
                  maxLength={2000}
                  rows={3}
                  defaultValue={run?.data.notes}
                  placeholder="Anything useful about this run"
                />
              </label>
            </details>
          </div>
          {run && (
            <div className="gic-panel">
              <h2>Correction record</h2>
              <label>
                Status
                <select name="status" defaultValue={run.data.status}>
                  <option value="active">Active</option>
                  <option value="void">Void — exclude from totals</option>
                </select>
              </label>
              <label>
                Reason for change
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  rows={2}
                />
              </label>
              <p className="gic-caption">
                The previous version stays in the history.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="gic-error">
              {error}
            </p>
          )}
          <div className="gic-form-actions">
            <Link
              href={run ? `/gic/runs/${id}` : "/gic"}
              className="gic-button"
            >
              Cancel
            </Link>
            <button className="gic-button primary" disabled={pending}>
              {pending ? "Saving…" : run ? "Save correction" : "Save run"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
