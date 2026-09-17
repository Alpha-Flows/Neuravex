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
 */
export function rewriteSiteLinks(
  html: string,
  siteSlug: string,
  pages: Map<string, string>,
  homeFile = "index.html",
): string {
  const base = `/sites/${siteSlug}`;
  return html.replace(/href="([^"]*)"/g, (match, href: string) => {
    if (href === base || href === `${base}/`) return `href="${homeFile}"`;
    if (!href.startsWith(`${base}/`)) return match;
    const slug = href.slice(base.length + 1).replace(/\/$/, "");
    const file = pages.get(slug);
    return file ? `href="${file}"` : match;
  });
}

const ASSET_DIRS = ["uploads", "stock"] as const;
const ASSET_REFERENCE = /(["'(])\/(uploads|stock)\/([^"')\s]+)/g;

/** Every bundled upload or stock photo the page points at. */
export function collectLocalAssets(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(ASSET_REFERENCE)) {
    const [, , dir, file] = match;
    const clean = decodeURIComponent(file.split("?")[0].split("#")[0]);
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
  return html.replace(ASSET_REFERENCE, (_match, quote: string, dir: string, file: string) => {
    return `${quote}${dir}/${file}`;
  });
}

export interface PreparePageOptions {
  siteSlug: string;
  /** Page slug to file name, for every page included in this export. */
  pages: Map<string, string>;
  stylesheetHref: string;
}

/** Everything above, in the order a page needs it. */
export function prepareExportedPage(
  html: string,
  { siteSlug, pages, stylesheetHref }: PreparePageOptions,
): { html: string; assets: string[] } {
  let out = stripAppRuntime(html);
  out = cleanBodyClasses(out);
  out = rewriteSiteLinks(out, siteSlug, pages);
  const assets = collectLocalAssets(out);
  out = rewriteAssetPaths(out);
  out = injectStylesheet(out, stylesheetHref);
  return { html: out, assets };
}

export { ASSET_DIRS };
