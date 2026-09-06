import { NextRequest } from "next/server";
import { requireAccess } from "@/lib/gic/server";
import {
  componentNames,
  componentCsv,
  csv,
  displayDate,
  fields,
  fineGold,
  processingRows,
  rowIssues,
  type Component,
  type ReturnRow,
  type Run,
  type AnnualReport,
} from "@/lib/gic/model";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const { db, workspace } = await requireAccess();
  const q = request.nextUrl.searchParams;
  const yearValue = q.get("year") ?? "all";
  if (
    yearValue !== "all" &&
    (!/^\d{4}$/.test(yearValue) ||
      Number(yearValue) < 2000 ||
      Number(yearValue) > 2100)
  )
    return new Response("Invalid period", { status: 400 });
  const year = yearValue === "all" ? undefined : Number(yearValue);
  const { data: snapshot, error: snapshotError } = await db.rpc(
    "gic_export_snapshot",
    { p_workspace: workspace.id, p_year: year ?? null },
  );
  if (snapshotError || !snapshot)
    return new Response("Could not load the export. Please try again.", {
      status: 503,
    });
  const runs = snapshot.runs as Run[];
  let headers: string[];
  let rows: ReturnRow[];
  let filename: string;
  if (q.get("kind") === "return") {
    const component = q.get("component") as Component;
    if (!year || !componentNames.includes(component))
      return new Response("Choose a reporting component and financial year.", {
        status: 400,
      });
    const report = snapshot.report as AnnualReport | null;
    if (
      !report ||
      !report.data.coverage_confirmed ||
      !report.data.checks[component] ||
      report.runs_version !== snapshot.runs_version
    )
      return new Response(
        "Review and save this annual draft before exporting. Processing records may have changed.",
        { status: 422 },
      );
    rows =
      component === "PRODUCTS_PROCESSED"
        ? processingRows(runs, report.data, workspace.mine_name)
        : (report.data.rows[component] ?? []);
    if (
      !rows.length ||
      (component === "MINE_DETAILS" && rows.length !== 1) ||
      rows.some((r) => rowIssues(component, r, year).length > 0)
    )
      return new Response(
        "Complete the missing or invalid component fields before exporting.",
        { status: 422 },
      );
    headers = fields[component].map((f) => f.key);
    filename = `${component}.csv`;
  } else if (q.get("kind") === "runs") {
    const search = (q.get("search") ?? "").toLowerCase();
    headers = [
      "Run reference",
      "Processed at (ISO 8601)",
      "Processed at (AEST)",
      "Gold weight recovered (g)",
      "Gold percentage of bullion (%)",
      "Contained gold (g)",
      "Tonnes input (t)",
      "Status",
      "Version",
      "Recorded at (UTC)",
      "Updated at (UTC)",
      "Notes",
    ];
    rows = runs
      .filter(
        (r) =>
          (q.get("voided") === "1" || r.data.status !== "void") &&
          `${r.data.reference} ${r.data.notes}`.toLowerCase().includes(search),
      )
      .map((r) =>
        Object.fromEntries(
          headers.map((h, i) => [
            h,
            String(
              [
                r.data.reference,
                r.data.processed_at,
                displayDate(r.data.processed_at),
                r.data.gross_grams,
                r.data.gold_percent,
                Number(fineGold(r.data).toFixed(5)),
                r.data.feed_tonnes,
                r.data.status,
                r.version,
                r.created_at,
                r.updated_at,
                r.data.notes,
              ][i],
            ),
          ]),
        ),
      );
    filename = `GIC-runs-${yearValue}.csv`;
  } else return new Response("Unknown export", { status: 400 });
  return new Response(
    q.get("kind") === "return"
      ? componentCsv(q.get("component") as Component, rows)
      : csv(headers, rows),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
