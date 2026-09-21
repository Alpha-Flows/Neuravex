/**
 * Where this server is, and where the sites it serves say they are.
 *
 * These are two different questions and the code used to answer both with
 * `new URL(req.url).origin`.
 *
 * Next builds `req.url` from the address it is listening on — but it takes the
 * scheme from `X-Forwarded-Proto`. The nginx recipe in `INSTALL.md` sets that
 * to `$scheme`, so behind TLS the download route worked out
 * `https://localhost:3939`, fetched its own plaintext port over TLS, and died
 * with `ERR_SSL_PACKET_LENGTH_TOO_LONG` — an unhandled 500 rather than the 502
 * it meant to return. Every download behind the documented proxy failed. The
 * sitemap, meanwhile, advertised `https://localhost:3939/…` to crawlers.
 *
 * So: `internalOrigin()` is how this process reaches itself, built from the
 * port and nothing a client can influence. `publicOrigin()` is the address
 * visitors use, which only the operator knows — it comes from PUBLIC_URL, or
 * from the forwarded headers when the operator has said there is a proxy.
 */

/** The port this server is listening on. */
function port(): string {
  return process.env.PORT || "3000";
}

/**
 * The origin this process uses to reach itself.
 *
 * Loopback, plain http, always: the server is on the other end of this socket,
 * and no header a client sends has any bearing on where that is.
 */
export function internalOrigin(): string {
  return `http://127.0.0.1:${port()}`;
}

export interface ForwardedHeaders {
  get(name: string): string | null;
}

/**
 * The address a visitor reaches this site at.
 *
 * PUBLIC_URL first, because that is the operator stating it. Failing that, the
 * forwarded headers — but only when NEURAVEX_TRUST_PROXY says there is
 * something in front that sets them, since otherwise they are whatever the
 * client felt like sending. Failing that, `localhost`, which is true for the
 * deployment this app is designed for.
 */
export function publicOrigin(headers?: ForwardedHeaders): string {
  const configured = process.env.PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (headers && process.env.NEURAVEX_TRUST_PROXY === "1") {
    const host = headers.get("x-forwarded-host") ?? headers.get("host");
    const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
    if (host && /^[a-z]+$/i.test(proto)) return `${proto}://${host}`;
  }

  if (headers) {
    const host = headers.get("host");
    if (host) return `http://${host}`;
  }

  return `http://localhost:${port()}`;
}
