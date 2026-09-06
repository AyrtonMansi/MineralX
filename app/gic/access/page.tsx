import { redirect } from "next/navigation";
import { configured, database } from "@/lib/gic/server";
import { signOut } from "../actions";
export default async function AccessPage() {
  if (!configured()) redirect("/gic/login");
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/gic/login");
  return (
    <main id="main-content" className="gic-login">
      <h1>Access hasn’t been assigned yet</h1>
      <p className="gic-muted">
        You’re signed in. Ask your MineralX administrator to add your account to
        the processing workspace.
      </p>
      <form action={signOut}>
        <button className="gic-button">Sign out</button>
      </form>
    </main>
  );
}
