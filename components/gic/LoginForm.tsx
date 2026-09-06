"use client";
import { useState } from "react";
import { signIn } from "@/app/gic/actions";
import Link from "next/link";
export function LoginForm({ active }: { active: boolean }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError("");
        try {
          const r = await signIn(new FormData(e.currentTarget));
          if (r.error) setError(r.error);
        } catch {
          setError("Sign-in could not complete. Please try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      {!active && (
        <p className="gic-notice" role="status">
          Secure access is being activated. Sign-in will be available once setup
          is complete.
        </p>
      )}
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          disabled={!active}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!active}
        />
      </label>
      {error && (
        <p className="gic-error" role="alert">
          {error}
        </p>
      )}
      <button className="gic-button primary wide" disabled={!active || pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {active && (
        <p className="gic-caption">
          <Link
            href="/gic/forgot-password"
            className="underline underline-offset-4"
          >
            Forgot password?
          </Link>
        </p>
      )}
    </form>
  );
}
