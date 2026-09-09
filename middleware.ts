import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {developmentPage,DEVELOPMENT_MODE_COOKIE,DEVELOPMENT_ACCESS_ENABLED} from "@/lib/ops/development-policy";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const chosen = request.nextUrl.searchParams.get('mode');
  const explicit = chosen === 'staff' || chosen === 'development' ? chosen : undefined;
  const preference = path === '/ops/login' ? 'staff' : explicit || request.cookies.get(DEVELOPMENT_MODE_COOKIE)?.value;
  const development = developmentPage(path, preference, DEVELOPMENT_ACCESS_ENABLED && process.env.MINERALX_DEVELOPMENT_ACCESS !== 'off');
  // Overwrite caller-supplied mode headers. This controls presentation only, never API access.
  request.headers.set('x-mineralx-ops-mode', development ? 'development' : 'staff');
  request.headers.set('x-mineralx-ops-section', path==='/ops/meetings'||path.startsWith('/ops/meetings/')?'meetings':'operations');
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!development && (request.nextUrl.pathname.startsWith("/gic") || request.nextUrl.pathname.startsWith("/ops") || request.nextUrl.pathname.startsWith("/api/ops")) && url && key) {
    const db = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    await db.auth.getUser();
  }
  if ((path === '/ops' || path.startsWith('/ops/')) && explicit) {
    response.cookies.set(DEVELOPMENT_MODE_COOKIE, preference!, {path:'/ops', httpOnly:true, sameSite:'lax', secure:request.nextUrl.protocol==='https:', maxAge:604800});
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
export const config = { matcher: ["/gic/:path*", "/plant/:path*", "/ops/:path*", "/api/ops/:path*"] };
