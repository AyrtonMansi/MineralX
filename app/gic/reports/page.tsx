import { requireAccess, getAnnual, getRuns } from "@/lib/gic/server";
import { financialYear } from "@/lib/gic/model";
import { WorkspaceNav } from "@/components/gic/WorkspaceNav";
import { AnnualEditor } from "@/components/gic/AnnualEditor";
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { db, workspace } = await requireAccess();
  const query = await searchParams;
  const currentYear = financialYear(new Date().toISOString());
  const year =
    query.year &&
    /^\d{4}$/.test(query.year) &&
    Number(query.year) >= 2000 &&
    Number(query.year) <= currentYear
      ? Number(query.year)
      : currentYear - 1;
  const [report, runs] = await Promise.all([
    getAnnual(db, workspace.id, year),
    getRuns(db, workspace.id, year),
  ]);
  return (
    <main id="main-content" className="gic-container">
      <WorkspaceNav workspace={workspace} current="reports" />
      <AnnualEditor
        key={year}
        report={report}
        runs={runs}
        year={year}
        currentYear={currentYear}
        mineName={workspace.mine_name}
        runsVersion={workspace.runs_version}
        writable={workspace.role !== "viewer"}
      />
    </main>
  );
}
