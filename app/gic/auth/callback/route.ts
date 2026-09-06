import { NextRequest, NextResponse } from "next/server";
import { configured, database } from "@/lib/gic/server";
export async function GET(request: NextRequest) {
  if (!configured())
    return NextResponse.redirect(new URL("/gic/login", request.url));
  const db = await database();
  const q = request.nextUrl.searchParams;
  const code = q.get("code");
  const token = q.get("token_hash");
  const type = q.get("type");
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/gic/password", request.url));
  } else if (token && (type === "invite" || type === "recovery")) {
    const { error } = await db.auth.verifyOtp({ token_hash: token, type });
    if (!error)
      return NextResponse.redirect(new URL("/gic/password", request.url));
  }
  return NextResponse.redirect(
    new URL("/gic/forgot-password?expired=1", request.url),
  );
}
