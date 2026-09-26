/**
 * Where a downloaded site will live once it is put online.
 *
 * The download was a folder whose address nobody knew, so everything in it
 * that a search engine wants as a full address was left relative or left out:
 * the canonical link said `about.html`, a social preview's picture said
 * `uploads/hero.webp` — which Facebook and LinkedIn cannot fetch from a
 * relative path — and there was no `sitemap.xml` at all, since its entries
 * have to be absolute. The operator knows where the site is going; once they
 * say, all three can be written properly.
 *
 * Dependency-free: the settings panel checks what is typed with it too.
 */

/**
 * A site address as it is kept: scheme, host and any folder, no trailing
 * slash, no query or fragment — `https://example.com` or
 * `https://example.com/bakery`. A bare `example.com` is taken to mean https.
 * Null for anything that is not an http(s) address of a real host.
 */
export function cleanSiteUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const typed = raw.trim();
  if (!typed || typed.length > 500) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  // A name with no dot is a machine on somebody's own network, not an
  // address a search engine or a social network can reach.
  if (!url.hostname.includes(".")) return null;
  // Whoever typed the home page's own file name meant the folder it is in.
  const path = url.pathname.replace(/\/index\.html?$/i, "").replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/**
 * The full address of a file in the download: the home page is the folder's
 * own address, so `index.html` is left off it the way a host serves it.
 */
export function addressOf(siteUrl: string, file: string): string {
  const clean = file.replace(/^\/+/, "");
  return clean === "index.html" || clean === "" ? `${siteUrl}/` : `${siteUrl}/${clean}`;
}

/** The folder the site sits in on its host, as a `<base href>` wants it: `/` or `/bakery/`. */
export function basePathOf(siteUrl: string | null | undefined): string {
  if (!siteUrl) return "/";
  try {
    const path = new URL(siteUrl).pathname.replace(/\/+$/, "");
    return `${path}/`;
  } catch {
    return "/";
  }
}

/** Whether a reference is already a full address, or one that needs the site's in front of it. */
function isAbsolute(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}

/**
 * The page's head, with every address a crawler or a link preview reads made
 * absolute under `siteUrl`: the canonical link, the other-language versions,
 * and the social picture. Only in the head, and only these — the page's own
 * links stay relative, which is what lets the folder be opened from disk.
 */
export function absoluteHeadLinks(html: string, siteUrl: string): string {
  const absolute = (value: string) => (isAbsolute(value) || value.startsWith("#") ? value : addressOf(siteUrl, value));
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, (head) =>
    head
      .replace(/<link\b[^>]*>/gi, (tag) =>
        /\brel="(?:canonical|alternate)"/i.test(tag) && !/\btype="application\/atom\+xml"/i.test(tag)
          ? tag.replace(/\bhref="([^"]*)"/i, (_m, href: string) => `href="${absolute(href)}"`)
          : tag,
      )
      .replace(/<meta\b[^>]*>/gi, (tag) =>
        /\b(?:property|name)="(?:og:image|og:url|twitter:image)"/i.test(tag)
          ? tag.replace(/\bcontent="([^"]*)"/i, (_m, content: string) => `content="${absolute(content)}"`)
          : tag,
      ),
  );
}
