import { NextRequest, NextResponse } from "next/server";
import { configured, database } from "@/lib/gic/server";
export async function GET(request: NextRequest) {
  const meetings=request.cookies.get('mx-meeting-signin')?.value==='1';
  const verified=()=>{const response=NextResponse.redirect(new URL(meetings?'/ops/meetings':'/gic/password',request.url));response.cookies.delete('mx-meeting-signin');response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;};
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
      return verified();
  } else if (token && (type === "invite" || type === "recovery")) {
    const { error } = await db.auth.verifyOtp({ token_hash: token, type });
    if (!error)
      return verified();
  }
  return NextResponse.redirect(
    new URL("/gic/forgot-password?expired=1", request.url),
  );
}
