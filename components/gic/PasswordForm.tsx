"use client";
import { useState } from "react";
import { requestPasswordReset, updatePassword } from "@/app/gic/actions";
export function PasswordForm({
  mode,
  active = true,
}: {
  mode: "request" | "update";
  active?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError("");
        setMessage("");
        const form = new FormData(e.currentTarget);
        try {
          if (mode === "request") {
            const r = await requestPasswordReset(form);
            setError(r.error ?? "");
            setMessage(r.message ?? "");
          } else {
            const r = await updatePassword(form);
            setError(r?.error ?? "");
          }
        } catch {
          setError("The request could not complete. Please try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      {mode === "request" ? (
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            disabled={!active}
          />
        </label>
      ) : (
        <>
          <label>
            New password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              name="confirmation"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
        </>
      )}
      {error && (
        <p className="gic-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="gic-success" role="status">
          {message}
        </p>
      )}
      <button className="gic-button primary wide" disabled={pending || !active}>
        {pending
          ? "Please wait…"
          : mode === "request"
            ? "Send reset link"
            : "Set password"}
      </button>
    </form>
  );
}
