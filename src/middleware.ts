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

/**
 * Where an embedded player is allowed to come from.
 *
 * The same list the HTML sanitiser will accept an <iframe> from, so the two
 * cannot drift into disagreeing about which players work.
 */
const EMBED_HOSTS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://youtube.com",
  "https://vimeo.com",
  "https://player.vimeo.com",
  "https://codepen.io",
  "https://codesandbox.io",
];

/**
 * What the page is allowed to load, and from where.
 *
 * Scripts are named by a nonce that changes every request, so a <script> that
 * arrived inside somebody's content cannot run even if it gets past the
 * sanitisers — it has no way to know the number. `strict-dynamic` lets the
 * scripts that do carry it load the rest of the app.
 *
 * Styles are the exception: the site's own CSS and its branding are written
 * into <style> elements on the page by design, so those stay inline. CSS
 * cannot run script in any browser still shipping, and the fetching it can do
 * is what the CSS sanitiser takes out.
 *
 * Pictures and video may come from anywhere over https, because putting a
 * picture in by its address is a thing the builder is for. Everything the
 * page talks back to is this server: `connect-src 'self'` is what stops a
 * page quietly posting what it found somewhere else.
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // A dev server rebuilds the page in the browser, which needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data: https:",
    "media-src 'self' blob: data: https:",
    `frame-src ${EMBED_HOSTS.join(" ")}`,
    // A dev server keeps a socket open to tell the page what changed.
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const refusal = refuseIfCrossSite(req);
  if (refusal) return refusal;

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  // Next reads the policy back off the request to stamp the nonce onto its
  // own scripts, so it has to go on both sides.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/** Refuses a state-changing request that another site set off. */
function refuseIfCrossSite(req: NextRequest): NextResponse | null {
  if (!CHANGES_SOMETHING.has(req.method)) return null;

  const origin = req.headers.get("origin");
  if (!origin) return null;

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

  if (serving && asked === serving) return null;
  return refuse();
}

function refuse() {
  return NextResponse.json(
    { error: "This request came from another site, so it was not carried out." },
    { status: 403 },
  );
}

export const config = {
  // Everything the browser renders, so the policy travels with every page.
  // Next's own build output and the favicon are static files it serves
  // itself, and running this over them buys nothing.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
