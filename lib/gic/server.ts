import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AnnualReport, Run, Workspace } from "./model";

export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
export async function database() {
  if (!configured()) throw new Error("GIC access has not been activated.");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Middleware refreshes cookies for server renders. */
          }
        },
      },
    },
  );
}
export async function requireAccess(
  write = false,
  destination: "/gic" | "/plant" = "/gic",
) {
  const login =
    destination === "/plant" ? "/gic/login?next=/plant" : "/gic/login";
  if (!configured()) redirect(login);
  const db = await database();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) redirect(login);
  const { data, error } = await db
    .from("gic_members")
    .select("role, workspace:gic_workspaces(id,name,mine_name,runs_version)")
    .eq("user_id", user.id)
    .limit(2);
  if (error)
    throw new Error(
      "The run register is temporarily unavailable. Please try again.",
    );
  if (!data?.length) redirect("/gic/access");
  // This portal deliberately supports one operation per account. Do not silently mix mines.
  if (data.length !== 1)
    throw new Error(
      "Your account needs an operation assigned by the administrator.",
    );
  const row = data[0] as unknown as {
    role: Workspace["role"];
    workspace: Omit<Workspace, "role">;
  };
  const workspace: Workspace = { ...row.workspace, role: row.role };
  if (write && workspace.role === "viewer")
    throw new Error("Your account has read-only access.");
  return { db, user, workspace };
}
export async function getRuns(
  db: Awaited<ReturnType<typeof database>>,
  workspace: string,
  year?: number,
) {
  // Paginate explicitly: Supabase's default row cap must not truncate annual totals.
  const runs: Run[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db
      .from("gic_runs")
      .select("*")
      .eq("workspace_id", workspace)
      .order("processed_at", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (year)
      query = query
        .gte("processed_at", `${year - 1}-07-01T00:00:00+10:00`)
        .lt("processed_at", `${year}-07-01T00:00:00+10:00`);
    const { data, error } = await query;
    if (error)
      throw new Error("Could not load processing runs. Please try again.");
    runs.push(...(data as Run[]));
    if (data.length < 1000) break;
  }
  return runs;
}
export async function getAnnual(
  db: Awaited<ReturnType<typeof database>>,
  workspace: string,
  year: number,
) {
  const { data, error } = await db
    .from("gic_annual_reports")
    .select("*")
    .eq("workspace_id", workspace)
    .eq("year", year)
    .maybeSingle();
  if (error) throw new Error("Could not load the annual reporting draft.");
  return data as AnnualReport | null;
}
