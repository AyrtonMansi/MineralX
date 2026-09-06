import { redirect } from "next/navigation";
import { configured, database } from "@/lib/gic/server";
import { PasswordForm } from "@/components/gic/PasswordForm";
export default async function PasswordPage() {
  if (!configured()) redirect("/gic/login");
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/gic/forgot-password?expired=1");
  return (
    <main id="main-content" className="gic-login">
      <h1>Set your password</h1>
      <p className="gic-muted">
        Use at least 12 characters. You’ll sign in again after saving.
      </p>
      <PasswordForm mode="update" />
    </main>
  );
}
