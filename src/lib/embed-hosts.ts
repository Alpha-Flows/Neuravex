/**
 * Where an embedded player is allowed to come from.
 *
 * There used to be two of these lists — one in the HTML sanitiser, one in the
 * middleware's CSP — with a comment claiming they could not drift. They had
 * already drifted. Worse, the sanitiser's was a regular expression anchored at
 * the start of the URL and nothing else:
 *
 *   https://youtube.com.evil.example/x     the host is evil.example
 *   https://vimeo.com@evil.example/x       everything before @ is a username
 *   //youtube.com.evil.example/x           protocol-relative, same trick
 *
 * All three passed. On the builder the CSP caught them, but the exported site
 * has no CSP, so the customer's own domain ended up framing whatever the
 * author pointed it at — a fake checkout, a fake contact form — with the
 * `allow` attribute still on it asking for the camera.
 *
 * So: one list, parsed with `new URL()`, matched on the whole hostname.
 */

/** The exact hostnames an <iframe> may name. Nothing else, no subdomains. */
export const EMBED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.vimeo.com",
  "vimeo.com",
  "codepen.io",
  "codesandbox.io",
  // The map block's embedded mode, and the <iframe> OpenStreetMap's own share
  // dialog hands out for a Custom HTML block. Only the www host: that is the
  // one `export/embed.html` is served from, and the tile servers the frame
  // then draws from are the frame's business, not this page's `frame-src`.
  "www.openstreetmap.org",
] as const;

/** The same list as CSP source expressions, for `frame-src`. */
export const EMBED_ORIGINS = EMBED_HOSTS.map((host) => `https://${host}`);

/**
 * Hosts that serve a great deal besides the thing meant to be framed, held to
 * the one page that is.
 *
 * A video host's pages are all players, more or less. openstreetmap.org is a
 * whole application: with the host alone on the list, the sanitiser let a
 * Custom HTML block frame its sign-in page, a user's account settings or its
 * OAuth consent screen on the customer's site, which is a clickjacking setup
 * with somebody else's real login in it. Only the map is embeddable.
 */
const EMBED_PATHS: Partial<Record<(typeof EMBED_HOSTS)[number], string>> = {
  "www.openstreetmap.org": "/export/embed.html",
};

/**
 * The `allow` tokens an embedded player has any use for.
 *
 * The attribute used to survive sanitising untouched, so a frame could ask the
 * customer's visitors for the camera and the microphone. A video player needs
 * to go full screen and to keep playing; it does not need a camera, a payment
 * handler or a USB device.
 */
export const EMBED_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture";

/**
 * True when a URL names one of the hosts above over https.
 *
 * Protocol-relative URLs (`//host/path`) are resolved against https, because
 * that is what a browser on an https page does with them; on the exported
 * site, which may be served over http, they would resolve to http instead, so
 * they are rewritten to an absolute https URL by the sanitiser rather than
 * left ambiguous.
 */
export function isAllowedEmbed(src: string | undefined | null): boolean {
  return normalizeEmbed(src) !== undefined;
}

/**
 * The https URL an allowed embed should be stored as, or `undefined`.
 *
 * Userinfo (`https://vimeo.com@evil.example/`) is refused outright rather than
 * stripped: a URL that carries it was not written by somebody embedding a
 * video.
 */
export function normalizeEmbed(src: string | undefined | null): string | undefined {
  if (!src) return undefined;
  const trimmed = src.trim();
  if (!trimmed) return undefined;

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;
  const host = url.hostname.toLowerCase();
  if (!(EMBED_HOSTS as readonly string[]).includes(host)) return undefined;
  const path = EMBED_PATHS[host as (typeof EMBED_HOSTS)[number]];
  if (path !== undefined && url.pathname !== path) return undefined;

  // The privacy notice tells a visitor that Vimeo's player is asked not to
  // track them, and it says so for every player frame the page audit finds.
  // Only the video block used to ask: a frame pasted from Vimeo's own share
  // dialog into a Custom HTML block carried no `dnt`, and the notice was
  // wrong about it. So the question is put here, where every frame passes.
  if (host === "player.vimeo.com") url.searchParams.set("dnt", "1");

  return url.toString();
}
