"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveRun } from "@/app/gic/actions";
import {
  displayDate,
  displayDuration,
  financialYear,
  fyLabel,
  grams,
  localInput,
  runSchema,
  type Run,
  type RunInput,
} from "@/lib/gic/model";

const steps = ["Timing", "Production", "Review"];
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
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState("");
  const [start, setStart] = useState(
    run?.data.started_at ? localInput(run.data.started_at) : "",
  );
  const [end, setEnd] = useState(localInput(run?.data.processed_at ?? now));
  const [weight, setWeight] = useState(String(run?.data.gross_grams ?? ""));
  const [purity, setPurity] = useState(String(run?.data.gold_percent ?? ""));
  const [tonnes, setTonnes] = useState(String(run?.data.feed_tonnes ?? ""));
  const [notes, setNotes] = useState(run?.data.notes ?? "");
  const [status, setStatus] = useState<RunInput["status"]>(
    run?.data.status ?? "active",
  );
  const [reason, setReason] = useState("");
  const fine =
    weight !== "" && purity !== ""
      ? (Number(weight) * Number(purity)) / 100
      : null;
  const reference =
    run?.data.reference ??
    `GIC-${localInput(now).slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
  const startIso = start ? `${start}:00+10:00` : "";
  const endIso = end ? `${end}:00+10:00` : "";
  const cancelHref = run ? `/gic/runs/${id}` : "/gic";
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const changeStep = (next: number) => {
    setError("");
    setStep(next);
  };
  const numeric = (value: string) =>
    value.trim() === "" ? NaN : Number(value);
  return (
    <>
      <Link href={cancelHref} className="gic-back">
        ← {run ? "Run details" : "Processing runs"}
      </Link>
      <div className="gic-pagehead">
        <div>
          <h1>{run ? "Correct run" : "New processing run"}</h1>
          <p className="gic-muted">Gravity plant · {reference}</p>
        </div>
      </div>
      <form
        className="gic-run-form gic-wizard"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving.current) return;
          setError("");
          const parsed = runSchema.safeParse({
            reference,
            started_at: startIso,
            processed_at: endIso,
            gross_grams: step === 0 ? 0 : numeric(weight),
            gold_percent: step === 0 ? 0 : numeric(purity),
            feed_tonnes: step === 0 ? 0 : numeric(tonnes),
            notes,
            status,
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          if (step < 2) {
            changeStep(step + 1);
            return;
          }
          if (run && reason.trim().length < 3) {
            setError("Enter a short reason for the correction.");
            return;
          }
          saving.current = true;
          setPending(true);
          try {
            const result = await saveRun(
              parsed.data,
              id,
              run?.version ?? 0,
              reason,
            );
            if (result.error) setError(result.error);
            else {
              router.push(`/gic/runs/${id}`);
              router.refresh();
            }
          } catch {
            setError(
              "Could not save. Your entries are still here. Please try again.",
            );
          } finally {
            saving.current = false;
            setPending(false);
          }
        }}
      >
        <ol className="gic-steps" aria-label="Run entry progress">
          {steps.map((label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={i <= step ? "reached" : ""}
            >
              <span>{i < step ? "✓" : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <fieldset disabled={pending}>
          <legend className="sr-only">{steps[step]}</legend>
          <section
            className="gic-panel gic-step-panel"
            aria-labelledby="run-step-heading"
          >
            <p className="gic-caption">Step {step + 1} of 3</p>
            <h2 id="run-step-heading" ref={heading} tabIndex={-1}>
              {
                [
                  "When did the run take place?",
                  "Record the production",
                  "Review and save",
                ][step]
              }
            </h2>
            {step === 0 && (
              <>
                <p className="gic-muted">
                  Use Queensland time (AEST · UTC+10).
                </p>
                <label>
                  Start time
                  <input
                    name="started_at"
                    type="datetime-local"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    max={localInput(now)}
                  />
                </label>
                <label>
                  End time
                  <input
                    name="processed_at"
                    type="datetime-local"
                    required
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    min={start || undefined}
                    max={localInput(now)}
                  />
                </label>
                {start && end && Date.parse(endIso) > Date.parse(startIso) && (
                  <div className="gic-calculation">
                    <span>Run duration</span>
                    <output>{displayDuration(startIso, endIso)}</output>
                  </div>
                )}
              </>
            )}
            {step === 1 && (
              <>
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
                    value={tonnes}
                    onChange={(e) => setTonnes(e.target.value)}
                  />
                </label>
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
                      aria-describedby="bullion-weight-help"
                    />
                    <span className="gic-caption" id="bullion-weight-help">
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
                </div>
                <div className="gic-calculation">
                  <span>Contained gold</span>
                  <output aria-live="polite">
                    {fine === null || !Number.isFinite(fine)
                      ? "—"
                      : `${grams(fine)} g`}
                  </output>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <dl className="gic-review-values">
                  {[
                    ["Start time", displayDate(startIso) + " AEST"],
                    ["End time", displayDate(endIso) + " AEST"],
                    ["Duration", displayDuration(startIso, endIso)],
                    ["Tonnes input", `${grams(Number(tonnes))} t`],
                    ["Gold weight recovered", `${grams(Number(weight))} g`],
                    ["Gold percentage", `${grams(Number(purity))}%`],
                    ["Contained gold", `${grams(fine ?? 0)} g`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="gic-caption">
                  FY {fyLabel(financialYear(endIso))} · Production is recorded
                  against the run’s end time.
                </p>
                <details>
                  <summary>Optional notes</summary>
                  <label>
                    <span className="sr-only">Notes</span>
                    <textarea
                      name="notes"
                      rows={3}
                      maxLength={2000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anything useful about this run"
                    />
                  </label>
                </details>
                {run && (
                  <div className="gic-correction">
                    <label>
                      Status
                      <select
                        name="status"
                        value={status}
                        onChange={(e) =>
                          setStatus(e.target.value as RunInput["status"])
                        }
                      >
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
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <p className="gic-caption">
                      Previous values remain in the correction history.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
          {error && (
            <p role="alert" className="gic-error">
              {error}
            </p>
          )}
          <div className="gic-form-actions">
            {step === 0 ? (
              <Link href={cancelHref} className="gic-button">
                Cancel
              </Link>
            ) : (
              <button
                className="gic-button"
                type="button"
                onClick={() => changeStep(step - 1)}
              >
                Back
              </button>
            )}
            <button className="gic-button primary" disabled={pending}>
              {pending
                ? "Saving…"
                : step < 2
                  ? "Continue"
                  : run
                    ? "Save correction"
                    : "Save run"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
