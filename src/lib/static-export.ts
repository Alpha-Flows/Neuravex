/**
 * Turning a rendered page into a standalone file.
 *
 * The export fetches each published page from the running server, so what
 * lands in the download is the same HTML a visitor sees — no second renderer
 * to drift out of step with the real one. What is left is to cut the parts
 * that only make sense inside the app (the Next.js runtime), and to point
 * every link and asset at a file sitting next to the page instead of at a
 * server route.
 */

/** Where a page ends up in the archive. The home page becomes index.html. */
export function pageFileName(slug: string, isHome: boolean): string {
  if (isHome) return "index.html";
  const safe = slug
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${safe || "page"}.html`;
}

/**
 * Remove the application runtime: scripts, Next's own stylesheets and
 * preloads, and React's streaming markers. A downloaded page is plain HTML
 * and CSS, which is the point — it opens by double-clicking it.
 */
export function stripAppRuntime(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<link\b[^>]*\/_next\/[^>]*>/gi, "")
    .replace(/<!--\/?\$[!?]?-->/g, "")
    .replace(/\s*<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
}

/**
 * The builder's own theme classes ride along on <body> from the app layout.
 * They are more specific than any element-level override, so a downloaded
 * page would keep the dark editor background. Drop those two and leave the
 * rest (the font stack lives there too).
 */
const APP_BODY_CLASSES = new Set(["bg-bg", "text-fg"]);

export function cleanBodyClasses(html: string): string {
  return html.replace(/<body([^>]*?)\sclass="([^"]*)"/i, (match, before: string, classes: string) => {
    const kept = classes.split(/\s+/).filter((c) => c && !APP_BODY_CLASSES.has(c));
    return kept.length > 0 ? `<body${before} class="${kept.join(" ")}"` : `<body${before}`;
  });
}

/** Point the page at the stylesheet written alongside it. */
export function injectStylesheet(html: string, href: string): string {
  const tag = `<link rel="stylesheet" href="${href}">`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`);
  return tag + html;
}

/**
 * Rewrite in-site navigation to the neighbouring files.
 *
 * `pages` maps a page slug to its file name; the home page is also reachable
 * as the bare site URL. A link to a page that is not in this export (a draft,
 * when drafts are excluded) is left alone rather than pointed at a file that
 * will not be there.
 *
 * A fragment or a query string is carried across to the file. It used to be
 * read as part of the slug, so `/sites/acme/about#team` looked for a page
 * called `about#team`, found none, and was left pointing at a server that a
 * folder opened from disk does not have — while the plain link to the same
 * page beside it worked. The link picker keeps fragments on purpose, and a
 * pricing plan's button pointing at `#contact` on another page is exactly
 * what one looks like.
 */
export function rewriteSiteLinks(
  html: string,
  siteSlug: string,
  pages: Map<string, string>,
  homeFile = "index.html",
): string {
  const base = `/sites/${siteSlug}`;
  return html.replace(/href="([^"]*)"/g, (match, href: string) => {
    const cut = href.search(/[?#]/);
    const path = cut < 0 ? href : href.slice(0, cut);
    const tail = cut < 0 ? "" : href.slice(cut);
    if (path === base || path === `${base}/`) return `href="${homeFile}${tail}"`;
    if (!path.startsWith(`${base}/`)) return match;
    const slug = path.slice(base.length + 1).replace(/\/$/, "");
    const file = pages.get(slug);
    return file ? `href="${file}${tail}"` : match;
  });
}

const ASSET_DIRS = ["uploads", "stock"] as const;
/**
 * A reference to one of this site's files: a path after a quote or a bracket.
 *
 * Or after `&quot;`, which is how the quote arrives when it is inside an
 * attribute. A section's background is written `url("/uploads/x.png")`, so
 * that a file name with a bracket in it cannot end the declaration early, and
 * React writes that into the `style` attribute as `url(&quot;/uploads/…)` —
 * which this pattern did not match. Every section and column with a picture
 * behind it came out of the download pointing at `/uploads/…` on a server the
 * folder does not have, with the picture itself left out of the zip. An
 * ampersand ends the file name for the same reason.
 */
const ASSET_REFERENCE = /(["'(]|&quot;|&#x27;|&#39;)\/(uploads|stock)\/([^"')\s&]+)/g;

/**
 * `edit` applied to the page's references — the addresses in every tag, and
 * the body of every `<style>` — and never to the words on the page, between
 * tags or inside them.
 *
 * The rewrites below match a path after a quote or a bracket, and ran over
 * the whole document. A quote in text is written as `&quot;`, so that held
 * until there was a block whose text is full of brackets: a code sample
 * showing `url(/uploads/logo.png)` or a Markdown image came out of the
 * download changed, a file it merely named was copied into the zip, and one
 * match ran on through the markup after it and listed half a tag as a missing
 * file. React escapes `<` and `>` in text and in attribute values alike, so a
 * reference the page actually makes is always inside a tag or a stylesheet,
 * and words on the page never are.
 */
function inMarkup(html: string, edit: (markup: string) => string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>|<[^>]*>/gi, (markup) =>
    /^<style\b/i.test(markup)
      ? edit(markup)
      : markup.replace(ATTRIBUTE, (attribute, name: string, value: string) =>
          URL_ATTRIBUTES.has(name.toLowerCase()) ? attribute.slice(0, -value.length) + edit(value) : attribute,
        ),
  );
}

/**
 * The attributes a page makes a reference in, which are the only ones inside
 * a tag that `inMarkup` hands on.
 *
 * Inside a tag used to mean inside a reference, until the new blocks began
 * copying the author's words into attributes: a code sample's file name into
 * its `aria-label`, a picture's description into `alt` and into the label of
 * the link that opens it. A description reading "the logo (/uploads/logo.png)"
 * came out of the download with the screen-reader text changed beside a
 * caption that was not, the file it merely named copied into the zip, and the
 * README reporting a missing picture when it was not there. Words are words
 * in an attribute too; only these carry an address.
 */
const URL_ATTRIBUTES = new Set([
  "src", "href", "srcset", "imagesrcset", "poster", "style", "content", "action", "data", "xlink:href",
]);
const ATTRIBUTE = /\s([^\s"'<>/=]+)\s*=\s*("[^"]*"|'[^']*')/g;

/**
 * An absolute reference back at the builder, made relative first.
 *
 * Next has no `metadataBase`, so it falls back to `http://localhost:<port>`
 * and writes that into `og:image`. The asset pattern above needs a quote or a
 * bracket immediately before `/uploads`, so an absolute URL matched nothing:
 * the file was neither rewritten nor bundled, and the exported page advertised
 * a picture at an address that only exists on the machine that built it.
 */
const ABSOLUTE_SELF = /(["'(])(https?:\/\/[^"')\s/]*)\/(uploads|stock)\//gi;

/**
 * Only the builder's own addresses, when they are known. Without the list any
 * server's `/uploads/` counted as this one's, so a picture an author took
 * from `https://cdn.example.com/wp-content/uploads/hero.jpg` came out of the
 * download pointing at a `uploads/hero.jpg` nobody had copied.
 */
export function relativizeSelfUrls(html: string, selfOrigins?: string[]): string {
  const own = selfOrigins?.map((o) => o.replace(/\/+$/, "").toLowerCase());
  return inMarkup(html, (markup) =>
    markup.replace(ABSOLUTE_SELF, (match, quote: string, origin: string, dir: string) =>
      own && !own.includes(origin.toLowerCase()) ? match : `${quote}/${dir}/`,
    ),
  );
}

/**
 * An absolute link back at this site's own pages, made relative.
 *
 * Now that the published page carries a `metadataBase`, its canonical link is
 * absolute — which is what it should be on the served site, and wrong the
 * moment the folder is downloaded: `rewriteSiteLinks` below matches a path
 * beginning `/sites/<slug>`, so an absolute one went through untouched and the
 * customer's exported page pointed its canonical at the machine that built it.
 * Only this site's own slug is rewritten, so a deliberate link to another
 * Neuravex instance is left alone.
 */
export function relativizeSiteUrls(html: string, siteSlug: string): string {
  const escaped = siteSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(["'(])https?://[^"')\\s]*?(/sites/${escaped})(?=[/"')\\s]|$)`, "gi");
  return inMarkup(html, (markup) => markup.replace(pattern, (_match, quote: string, path: string) => `${quote}${path}`));
}

/** Every bundled upload or stock photo the page points at. */
export function collectLocalAssets(html: string): string[] {
  const found = new Set<string>();
  const markup: string[] = [];
  inMarkup(html, (part) => {
    markup.push(part);
    return part;
  });
  for (const match of markup.join("\n").matchAll(ASSET_REFERENCE)) {
    const [, , dir, file] = match;
    // A malformed percent escape used to throw here, and the whole download
    // became a 500 with no hint which block was responsible. One bad
    // reference is one missing picture.
    let clean: string;
    try {
      clean = decodeURIComponent(file.split("?")[0].split("#")[0]);
    } catch {
      continue;
    }
    if (!clean || clean.includes("..") || clean.startsWith("/")) continue;
    found.add(`${dir}/${clean}`);
  }
  return [...found].sort();
}

/**
 * Make asset URLs relative. Every page sits at the archive root, so an
 * absolute `/uploads/x.png` — which resolves to nothing when the file is
 * opened from disk — becomes `uploads/x.png`.
 */
export function rewriteAssetPaths(html: string): string {
  return inMarkup(html, (markup) =>
    markup.replace(ASSET_REFERENCE, (_match, quote: string, dir: string, file: string) => `${quote}${dir}/${file}`),
  );
}

/**
 * The policy an exported page carries in its own markup.
 *
 * The builder serves a nonce CSP on every response; a file opened from a
 * folder, or served by whatever static host the customer uses, has no headers
 * at all. That is exactly where the button href finding bites: on the
 * builder, `javascript:` on a call-to-action is refused by the policy, and on
 * the customer's own domain it runs. Every write path checks the scheme now;
 * this is the layer under that, for a page exported by an older version or an
 * archive edited by hand.
 *
 * `script-src 'none'` is safe to say because the export strips the runtime —
 * a downloaded site is HTML and CSS by design.
 */
export const EXPORT_CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">";

export function injectExportCsp(html: string): string {
  if (html.includes("</head>")) return html.replace("</head>", `${EXPORT_CSP}</head>`);
  return EXPORT_CSP + html;
}

/**
 * Stop an exported form from sending a visitor's answers anywhere.
 *
 * The export strips the script that posts a submission, and leaves the form
 * enabled. A `<form>` with no `action` and no `method` submits as a GET to
 * itself — so pressing Send navigated to
 * `contact.html?field-0=Alice&field-1=alice%40example.org&field-2=my+medical+question`,
 * which the static host wrote into its access log and the browser wrote into
 * its history. The generated privacy notice, meanwhile, said input "verlässt
 * Ihren Browser nicht".
 *
 * An inline attribute survives the script strip and needs no CSP allowance.
 * The note is there because a form that silently does nothing is its own
 * problem: the visitor should be told where to write instead, and the
 * operator should see that this is what an exported form does.
 */
const EXPORTED_FORM_NOTE =
  '<p data-exported-form-note style="margin-top:0.75rem;font-size:0.875rem;opacity:0.7">' +
  "This form is part of a downloaded copy of the site and cannot send anything. " +
  "Connect it to your own form handling, or contact us by the address above." +
  "</p>";

export function disableExportedForms(html: string): string {
  const withGuard = html.replace(/<form\b([^>]*)>/gi, (match, attrs: string) => {
    if (/\bonsubmit=/i.test(attrs)) return match;
    // `action=""` keeps a browser that ignores the handler from navigating
    // somewhere new; the handler is what stops the submit happening at all.
    return `<form${attrs} onsubmit="return false" data-exported-form="1">`;
  });

  if (!withGuard.includes('data-exported-form="1"')) return withGuard;
  return withGuard.replace(/<\/form>/gi, `${EXPORTED_FORM_NOTE}</form>`);
}

export interface PreparePageOptions {
  siteSlug: string;
  /** Page slug to file name, for every page included in this export. */
  pages: Map<string, string>;
  stylesheetHref: string;
  /** The addresses the builder itself is reached at, for `relativizeSelfUrls`. */
  selfOrigins?: string[];
}

/** Everything above, in the order a page needs it. */
export function prepareExportedPage(
  html: string,
  { siteSlug, pages, stylesheetHref, selfOrigins }: PreparePageOptions,
): { html: string; assets: string[] } {
  let out = stripAppRuntime(html);
  out = cleanBodyClasses(out);
  out = relativizeSelfUrls(out, selfOrigins);
  out = relativizeSiteUrls(out, siteSlug);
  out = rewriteSiteLinks(out, siteSlug, pages);
  const assets = collectLocalAssets(out);
  out = rewriteAssetPaths(out);
  out = disableExportedForms(out);
  out = injectStylesheet(out, stylesheetHref);
  out = injectExportCsp(out);
  return { html: out, assets };
}

export { ASSET_DIRS };
