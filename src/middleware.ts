import { NextRequest, NextResponse } from "next/server";

/**
 * Where a request that changes something is allowed to come from.
 *
 * Neuravex has no sign-in on purpose: it runs on your own machine and the
 * browser that reaches it is yours. That holds for anything typed into the
 * address bar — but not for the other tabs. Any page on the web can post to
 * http://localhost:3000/api/… in the background, and every one of these
 * routes would have done as it was told: delete a site, rewrite a page,
 * empty the trash. Nothing in the app checked where the request came from.
 *
 * A browser attaches `Origin` to every request that changes something, and a
 * page cannot forge it or leave it off. So an Origin that does not match the
 * address this server is answering on is another site asking, and is refused.
 *
 * No Origin at all means it did not come from a page: curl, the test runner,
 * a script of your own. Those are left alone — they are you at a terminal,
 * which is exactly the audience this app is written for.
 */
const CHANGES_SOMETHING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  if (!CHANGES_SOMETHING.has(req.method)) return NextResponse.next();

  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next();

  // Behind a reverse proxy the public name arrives forwarded; the nginx
  // example in INSTALL.md passes the original Host through, and either
  // spelling is the address the browser actually asked for.
  const serving = req.headers.get("x-forwarded-host") ?? req.headers.get("host");

  let asked: string;
  try {
    asked = new URL(origin).host;
  } catch {
    // An Origin that is not a URL is not one this server handed out.
    return refuse();
  }

  if (serving && asked === serving) return NextResponse.next();
  return refuse();
}

function refuse() {
  return NextResponse.json(
    { error: "This request came from another site, so it was not carried out." },
    { status: 403 },
  );
}

export const config = { matcher: "/api/:path*" };
