import Link from "next/link";
import { PasswordForm } from "@/components/gic/PasswordForm";
import { configured } from "@/lib/gic/server";
export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  return (
    <main id="main-content" className="gic-login">
      <h1>Reset your password</h1>
      <p className="gic-muted">Enter your MineralX workspace account email.</p>
      {expired && (
        <p className="gic-notice">
          That link has expired or has already been used. Request a new one.
        </p>
      )}
      {!configured() && (
        <p className="gic-notice">Secure access is awaiting activation.</p>
      )}
      <PasswordForm mode="request" active={configured()} />
      <Link href="/gic/login" className="gic-back">
        ← Sign in
      </Link>
    </main>
  );
}
