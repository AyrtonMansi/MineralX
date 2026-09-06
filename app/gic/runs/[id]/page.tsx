import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/gic/server";
import { WorkspaceNav } from "@/components/gic/WorkspaceNav";
import {
  displayDate,
  fineGold,
  grams,
  type Run,
  type RunInput,
} from "@/lib/gic/model";
export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db, workspace } = await requireAccess();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { data, error } = await db
    .from("gic_runs")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load run");
  if (!data) notFound();
  const run = data as Run;
  const r = run.data;
  const { data: history, error: historyError } = await db
    .from("gic_audit")
    .select("version,recorded_at,reason,snapshot,actor_id")
    .eq("workspace_id", workspace.id)
    .eq("entity_id", id)
    .order("version", { ascending: false })
    .limit(100);
  if (historyError) throw new Error("Could not load history");
  const facts: [string, string][] = [
    ["Processed · AEST", displayDate(r.processed_at)],
    ["Recorded · AEST", displayDate(run.created_at)],
    ["Tonnes input", `${grams(r.feed_tonnes)} t`],
    ["Process", "Gravity plant"],
    ["Product", "Bullion"],
    ["Updated · AEST", displayDate(run.updated_at)],
  ];
  return (
    <main id="main-content" className="gic-container">
      <WorkspaceNav workspace={workspace} current="runs" />
      <Link href="/gic" className="gic-back">
        ← Processing runs
      </Link>
      <div className="gic-pagehead">
        <div>
          <h1>{r.reference}</h1>
          <p className="gic-muted">
            Version {run.version} ·{" "}
            {r.status === "void" ? "Voided" : "Active record"}
          </p>
        </div>
        {workspace.role !== "viewer" && (
          <Link className="gic-button" href={`/gic/runs/${id}/edit`}>
            Correct run
          </Link>
        )}
      </div>
      <div className="gic-stats three">
        <div>
          <span>Gold weight recovered</span>
          <p>
            {grams(r.gross_grams)} <small>g</small>
          </p>
        </div>
        <div>
          <span>Gold percentage</span>
          <p>
            {grams(r.gold_percent)}
            <small>%</small>
          </p>
        </div>
        <div>
          <span>Contained gold</span>
          <p>
            {grams(fineGold(r))} <small>g</small>
          </p>
        </div>
      </div>
      <div className="gic-panel">
        <h2>Run record</h2>
        <dl className="gic-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {r.notes && (
          <div className="gic-notes">
            <h3>Notes</h3>
            <p>{r.notes}</p>
          </div>
        )}
      </div>
      <div className="gic-panel">
        <h2>History</h2>
        <p className="gic-caption">
          Changes are saved with their original values and the account that made
          them. Latest 100 versions shown.
        </p>
        {history?.map((h) => (
          <details key={h.version} className="gic-history">
            <summary>
              Version {h.version} · {displayDate(h.recorded_at)} AEST{" "}
              <span>{h.reason}</span>
            </summary>
            <p className="gic-caption">Recorded by account {h.actor_id}</p>
            <dl className="gic-facts">
              {Object.entries(h.snapshot as RunInput).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>{v === null || v === "" ? "Not recorded" : String(v)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
    </main>
  );
}
