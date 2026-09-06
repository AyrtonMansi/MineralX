import { requireAccess, getRuns } from "@/lib/gic/server";
import { WorkspaceNav } from "@/components/gic/WorkspaceNav";
import { RunRegister } from "@/components/gic/RunRegister";
import { financialYear } from "@/lib/gic/model";
export default async function Dashboard() {
  const { db, workspace } = await requireAccess();
  const runs = await getRuns(db, workspace.id);
  return (
    <main id="main-content" className="gic-container">
      <WorkspaceNav workspace={workspace} current="runs" />
      <RunRegister
        runs={runs}
        writable={workspace.role !== "viewer"}
        currentYear={financialYear(new Date().toISOString())}
      />
    </main>
  );
}
