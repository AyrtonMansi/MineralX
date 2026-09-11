"use server";
import { z } from "zod";
import { database, configured } from "@/lib/gic/server";
import { company } from "@/lib/content";
import { resetFailureMessage } from "@/lib/gic/login-routing";

/** Ops's own password-reset request. Kept independent of the retired GIC pages:
 * it redirects through /ops/auth/callback (which lands on /ops/account, where
 * the "Set a new password" form lives), not GIC's callback/password pages. */
export async function requestPasswordReset(form: FormData) {
  if (!configured()) return { error: "Secure access is awaiting activation." };
  const email = z.string().trim().email().max(254).safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const db = await database();
  // Supabase applies email and IP rate limits. Never expose whether an account exists.
  try {
    const { error } = await db.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${company.url}/ops/auth/callback`,
    });
    if (error) return { error: resetFailureMessage(error) };
  } catch (error) {
    return { error: resetFailureMessage(error) };
  }
  return {
    message:
      "If this account is eligible, you’ll receive a password reset link. Check your inbox and spam folder.",
  };
}
