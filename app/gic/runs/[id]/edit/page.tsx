import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/gic/server";
import { WorkspaceNav } from "@/components/gic/WorkspaceNav";
import { RunForm } from "@/components/gic/RunForm";
import type { Run } from "@/lib/gic/model";
export default async function EditRun({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db, workspace } = await requireAccess(true);
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
  return (
    <main id="main-content" className="gic-container">
      <WorkspaceNav workspace={workspace} current="runs" />
      <RunForm id={id} run={data as Run} now={new Date().toISOString()} />
    </main>
  );
}
