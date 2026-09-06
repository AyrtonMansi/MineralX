import Link from "next/link";
import { requireAccess } from "@/lib/gic/server";
import { plantSchema } from "@/lib/plant/model";
import { PlantDashboard } from "@/components/plant/PlantDashboard";
import { signOut } from "@/app/gic/actions";
export default async function PlantPage() {
  const { db, workspace } = await requireAccess(false, "/plant");
  const { data, error } = await db
    .from("plant_layouts")
    .select("data")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (error)
    throw new Error("The plant plan could not be loaded. Please try again.");
  const result = data ? plantSchema.safeParse(data.data) : null;
  if (result && !result.success)
    throw new Error(
      "This plan revision needs review before it can be displayed.",
    );
  return (
    <>
      <header className="plant-topbar">
        <Link href="/" className="plant-brand">
          MINERAL<span>X</span>
        </Link>
        <span className="plant-workspace-name">
          {workspace.name} <span>/ Workspace</span>
        </span>
        <nav aria-label="Workspace">
          <Link href="/plant" aria-current="page">
            Plant plan
          </Link>
          <Link href="/gic">Gold production</Link>
          <form action={signOut}>
            <button>Sign out</button>
          </form>
        </nav>
      </header>
      {result?.success ? (
        <PlantDashboard model={result.data} />
      ) : (
        <main id="main-content" className="plant-empty">
          <p className="plant-eyebrow">Plant workspace</p>
          <h1>Your plant plan is awaiting import</h1>
          <p>
            The administrator can load the reviewed layout for this operation.
          </p>
          <Link href="/gic">Open gold production →</Link>
        </main>
      )}
    </>
  );
}
