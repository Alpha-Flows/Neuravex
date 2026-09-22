import { NextRequest, NextResponse } from "next/server";
import { EMBED_ORIGINS } from "@/lib/embed-hosts";

/**
 * Which names this server answers to.
 *
 * The Origin check below compares the Origin header's host with the host the
 * request was sent to — and nothing, anywhere, said which hosts this server is
 * supposed to be. So a request whose Origin and Host both read
 * `attacker.tld:3939` matched itself and went through.
 *
 * That is exactly the shape of DNS rebinding. The victim opens an attacker's
 * page; `attacker.tld` resolves first to the attacker's own server and then,
 * seconds later, to 127.0.0.1; from then on the page's fetches to
 * `http://attacker.tld:3939/api/…` are same-origin, carry a matching Origin,
 * and are answered by Neuravex. With no sign-in in front of it, that is read
 * and write over every site and every stored visitor submission, from one page
 * visit.
 *
 * A name that comes out of DNS is the whole mechanism, so the defence is to
 * refuse names. An IP literal cannot be re-pointed: whatever
 * `http://127.0.0.1:3939/` resolves to is 127.0.0.1. `localhost` is special-
 * cased by every browser and resolver to the loopback address. Everything else
 * has to be named by the operator in NEURAVEX_ALLOWED_HOSTS, which is what a
 * reverse proxy deployment does.
 *
 * Unlike the Origin check this runs on every method, because a GET is enough
 * to read out every site through the export route.
 */
function allowedHosts(): string[] {
  return (process.env.NEURAVEX_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** An IPv4 literal, an IPv6 literal, or a bracketed IPv6 literal. */
function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host.split(".").every((part) => Number(part) <= 255);
  }
  // A bracketed IPv6 address; the URL parser is the authority on the inside.
  if (host.startsWith("[") && host.endsWith("]")) {
    try {
      return new URL(`http://${host}/`).hostname === host.toLowerCase();
    } catch {
      return false;
    }
  }
  return false;
}

/** Splits `host:port` into its host, leaving a bracketed IPv6 address whole. */
function hostOnly(authority: string): string {
  const value = authority.trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1) || value;
  const colon = value.lastIndexOf(":");
  return colon === -1 ? value : value.slice(0, colon);
}

/** True when this server is willing to be addressed by that name. */
export function isServableHost(authority: string | null): boolean {
  if (!authority) return false;
  const host = hostOnly(authority);
  if (!host) return false;

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isIpLiteral(host)) return true;
  return allowedHosts().includes(host);
}

/**
 * Whether a forwarded host may be believed.
 *
 * `X-Forwarded-Host` is set by a reverse proxy — and by anybody else who feels
 * like setting it, which is how it used to override `Host` in the comparison
 * below for any client that asked. A browser cannot send it cross-origin
 * without a preflight the API never approves, so there was no privilege to
 * gain today; it would become one the day a mutating route answered CORS.
 * Now it counts only where the operator has said there is a proxy in front.
 */
function trustsProxy(): boolean {
  return process.env.NEURAVEX_TRUST_PROXY === "1";
}

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
 * What the page is allowed to load, and from where.
 *
 * Scripts are named by a nonce that changes every request, so a <script> that
 * arrived inside somebody's content cannot run even if it gets past the
 * sanitisers — it has no way to know the number. `strict-dynamic` lets the
 * scripts that do carry it load the rest of the app.
 *
 * Styles are split. A <style> element is the app's own — the site's CSS and
 * its branding are written into one by design — so those carry the nonce and
 * nothing else is accepted as an element. A `style` attribute is a different
 * thing: it is what content is allowed to carry, and there is no nonce for an
 * attribute, so `style-src-attr` stays permissive and the sanitiser is what
 * filters it. Splitting them means a <style> element that gets past a
 * sanitiser one day still does not run, which the old blanket
 * `style-src 'unsafe-inline'` could not say.
 *
 * Pictures and video may come from anywhere over https, because putting a
 * picture in by its address is a thing the builder is for. Everything the
 * page talks back to is this server: `connect-src 'self'` is what stops a
 * page quietly posting what it found somewhere else.
 */
export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV !== "production"): string {
  return [
    "default-src 'self'",
    // A dev server rebuilds the page in the browser, which needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Kept as the fallback for browsers that do not split the two.
    "style-src 'self' 'unsafe-inline'",
    `style-src-elem 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data: https:",
    "media-src 'self' blob: data: https:",
    `frame-src ${EMBED_ORIGINS.join(" ")}`,
    // A dev server keeps a socket open to tell the page what changed.
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    // A sanitiser gap shows up here before it shows up anywhere else.
    "report-uri /api/csp-report",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  // Before anything else, and before a nonce is minted for a page that should
  // never have been rendered: is this server even supposed to answer to that
  // name?
  const serving = servingHost(req);
  if (!isServableHost(serving)) return misdirected();

  const refusal = refuseIfCrossSite(req, serving);
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

/** The authority this request was addressed to, forwarded or direct. */
function servingHost(req: NextRequest): string | null {
  const forwarded = trustsProxy() ? req.headers.get("x-forwarded-host") : null;
  return forwarded ?? req.headers.get("host");
}

/** Refuses a state-changing request that another site set off. */
function refuseIfCrossSite(req: NextRequest, serving: string | null): NextResponse | null {
  if (!CHANGES_SOMETHING.has(req.method)) return null;

  const origin = req.headers.get("origin");
  if (!origin) return null;

  let asked: URL;
  try {
    asked = new URL(origin);
  } catch {
    // An Origin that is not a URL is not one this server handed out.
    return refuse();
  }

  if (!serving) return refuse();

  // Behind a proxy that terminates TLS the browser's origin is https while
  // this server speaks plain http, so the scheme is only compared where the
  // proxy has told us what it was.
  if (trustsProxy()) {
    const scheme = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (scheme && asked.protocol !== `${scheme}:`) return refuse();
  }

  if (asked.host.toLowerCase() === serving.trim().toLowerCase()) return null;
  return refuse();
}

function refuse() {
  return NextResponse.json(
    { error: "This request came from another site, so it was not carried out." },
    { status: 403 },
  );
}

function misdirected() {
  return NextResponse.json(
    {
      error:
        "This server does not answer to that address. Reach it at localhost or " +
        "its IP address, or list the name in NEURAVEX_ALLOWED_HOSTS.",
    },
    { status: 421 },
  );
}

export const config = {
  // Everything the browser renders, so the policy travels with every page.
  // Next's own build output and the favicon are static files it serves
  // itself, and running this over them buys nothing.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
