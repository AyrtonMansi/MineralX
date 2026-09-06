import Link from "next/link";
import { signOut } from "@/app/gic/actions";
import type { Workspace } from "@/lib/gic/model";
export function WorkspaceNav({
  workspace,
  current,
}: {
  workspace: Workspace;
  current: "runs" | "reports";
}) {
  return (
    <div className="gic-workspace">
      <div>
        <p>{workspace.name}</p>
        <span className="gic-caption">{workspace.mine_name}</span>
      </div>
      <nav aria-label="Workspace navigation">
        <Link
          href="/gic"
          aria-current={current === "runs" ? "page" : undefined}
        >
          Runs
        </Link>
        <Link
          href="/gic/reports"
          aria-current={current === "reports" ? "page" : undefined}
        >
          Annual reporting
        </Link>
        <Link href="/plant">Plant plan</Link>
        <form action={signOut}>
          <button>Sign out</button>
        </form>
      </nav>
    </div>
  );
}
