"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { database, configured, requireAccess } from "@/lib/gic/server";
import { annualSchema, runSchema } from "@/lib/gic/model";
import { company } from "@/lib/content";

export async function signIn(form: FormData): Promise<{ error?: string }> {
  if (!configured())
    return {
      error:
        "Secure access is awaiting activation. Please contact your MineralX administrator.",
    };
  const email = z.string().email().max(254).safeParse(form.get("email"));
  const password = z.string().min(1).max(256).safeParse(form.get("password"));
  if (!email.success || !password.success)
    return { error: "Enter your email and password." };
  const db = await database();
  const { error } = await db.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error)
    return {
      error: "Sign-in failed. Check your details or try again shortly.",
    };
  redirect(form.get("next") === "/plant" ? "/plant" : "/gic");
}
export async function signOut() {
  if (configured()) {
    const db = await database();
    await db.auth.signOut();
  }
  redirect("/gic/login");
}
export async function requestPasswordReset(form: FormData) {
  if (!configured()) return { error: "Secure access is awaiting activation." };
  const email = z.string().email().max(254).safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const db = await database();
  // Supabase applies email and IP rate limits. Never expose whether an account exists.
  await db.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${company.url}/gic/auth/callback`,
  });
  return {
    message:
      "If this account is eligible, you’ll receive a password reset link. Check your inbox and spam folder.",
  };
}
export async function updatePassword(form: FormData) {
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return { error: "This link has expired. Request a new password reset." };
  const password = z.string().min(12).max(128).safeParse(form.get("password"));
  if (!password.success)
    return { error: "Use a password of 12–128 characters." };
  if (password.data !== form.get("confirmation"))
    return { error: "The passwords do not match." };
  const { error } = await db.auth.updateUser({ password: password.data });
  if (error)
    return {
      error:
        "Could not update the password. Try a different password or request a new link.",
    };
  await db.auth.signOut({ scope: "global" });
  redirect("/gic/login");
}
export async function saveRun(
  raw: unknown,
  id: string,
  version: number,
  reason: string,
) {
  const { db, workspace } = await requireAccess(true);
  const result = runSchema.safeParse(raw);
  if (!result.success) return { error: result.error.issues[0].message };
  if (
    !z.string().uuid().safeParse(id).success ||
    !Number.isInteger(version) ||
    version < 0
  )
    return { error: "Invalid run reference." };
  if (version && (reason.trim().length < 3 || reason.length > 500))
    return { error: "Please enter a short reason for this correction." };
  const { error } = await db.rpc("gic_save_run", {
    p_workspace: workspace.id,
    p_id: id,
    p_version: version,
    p_data: result.data,
    p_reason: reason,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "That reference already exists. Check the register before adding another run."
          : error.message.includes("CONFLICT")
            ? "Someone updated this record. Reload it before saving your changes."
            : "The run could not be saved. Your entries are still here; please try again.",
    };
  revalidatePath("/gic", "layout");
  return { id };
}
export async function saveAnnual(
  raw: unknown,
  year: number,
  version: number,
  runsVersion: number,
) {
  const { db, workspace } = await requireAccess(true);
  const result = annualSchema.safeParse(raw);
  if (!result.success) return { error: result.error.issues[0].message };
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(version) ||
    version < 0 ||
    !Number.isInteger(runsVersion) ||
    runsVersion < 0
  )
    return { error: "Invalid reporting period." };
  const { error } = await db.rpc("gic_save_annual", {
    p_workspace: workspace.id,
    p_year: year,
    p_version: version,
    p_data: result.data,
    p_runs_version: runsVersion,
  });
  if (error)
    return {
      error:
        error.message.includes("CONFLICT") || error.code === "23505"
          ? "This annual draft changed. Reload before saving."
          : "Could not save the annual draft. Your entries are still here.",
    };
  revalidatePath("/gic", "layout");
  return { version: version + 1 };
}
