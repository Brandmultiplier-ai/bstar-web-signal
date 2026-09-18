import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/public-config";

/**
 * Refreshes the Supabase session cookie on every navigation and bounces
 * unauthenticated traffic to the login page.
 *
 * The ingest routes are excluded by the matcher below: they authenticate with
 * a shared secret and are called by pg_cron, which does not carry a user session.
 */
export async function middleware(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const config = getSupabasePublicConfig();

  // createServerClient throws if URL/key are empty. Send the user to login
  // with a setup hint instead of crashing the whole request.
  if (!config.ready) {
    if (isLoginPage) return NextResponse.next({ request });
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("setup", "supabase");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser rather than getSession: it validates the token with Supabase
  // instead of trusting whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    // Remember where they were headed so login can return them there.
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static assets, and the two
     * secret-authenticated ingest paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/ingest|api/webhooks).*)",
  ],
};
