"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// Supabase's standard invitation emails return an implicit session in the
// fragment. Keep this isolated from the server-side PKCE callback, and let the
// provider SDK validate it and write the same cookies used by the server.
export default function CompleteInvitation() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || !window.location.hash) {
      setFailed(true);
      return;
    }
    const db = createBrowserClient(url, key, {
      isSingleton: false,
      auth: { flowType: "implicit", detectSessionInUrl: true },
    });
    void (async () => {
      try {
        const { error } = await db.auth.getSession();
        // Never trust a locally decoded session as proof of identity.
        const { data, error: userError } = await db.auth.getUser();
        window.history.replaceState(null, "", "/gic/auth/complete");
        if (error || userError || !data.user) throw new Error("Invalid link");
        if (active) window.location.replace("/gic/password");
      } catch {
        window.history.replaceState(null, "", "/gic/auth/complete");
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="gic-auth">
      <p className="gic-caption">MineralX · GIC</p>
      <h1>{failed ? "This link is unavailable" : "Opening your account"}</h1>
      <p className="gic-muted" role="status">
        {failed
          ? "The invitation may have expired or already been used. Request a new password link to continue."
          : "Please wait while we verify your invitation."}
      </p>
      {failed && (
        <Link className="gic-button" href="/gic/forgot-password">
          Request a new link
        </Link>
      )}
    </main>
  );
}
