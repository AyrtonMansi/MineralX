import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/gic/server";
import { WorkspaceNav } from "@/components/gic/WorkspaceNav";
import { RunForm } from "@/components/gic/RunForm";
export default async function NewRunPage() {
  const { workspace } = await requireAccess(true);
  return (
    <main id="main-content" className="gic-container">
      <WorkspaceNav workspace={workspace} current="runs" />
      <RunForm id={randomUUID()} now={new Date().toISOString()} />
    </main>
  );
}
