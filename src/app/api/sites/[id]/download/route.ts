import { NextRequest, NextResponse } from "next/server";
import { lstat } from "fs/promises";
import { join, resolve, sep } from "path";
import { existingUploadPath } from "@/lib/uploads";
import { prisma } from "@/lib/prisma";
import { zipStream, MAX_ZIP_BYTES, type ZipEntry, type ZipFileEntry } from "@/lib/zip";
import { buildExportCss } from "@/lib/export-css";
import { forwardingPage, pageFileName, prepareExportedPage } from "@/lib/static-export";
import { robotsTxt, sitemapXml } from "@/lib/seo";
import { absoluteHeadLinks, addressOf, basePathOf, cleanSiteUrl } from "@/lib/site-address";
import { internalOrigin, publicOrigin } from "@/lib/self-origin";
import { BUNDLED_FONTS } from "@/lib/fonts";
import { postItems } from "@/lib/posts";
import { atomFeed } from "@/lib/feed";
import { pageLanguage } from "@/lib/translations";

export const dynamic = "force-dynamic";

/** The name static hosts look for when an address finds nothing. */
const NOT_FOUND_FILE = "404.html";
/** The site's feed of posts, beside its pages. */
const FEED_FILE = "feed.xml";
/** Every page's full address, once the site's own is known. */
const SITEMAP_FILE = "sitemap.xml";

const STYLESHEET_PATH = "assets/site.css";

/**
 * GET /api/sites/[id]/download — the site as a folder of files, zipped.
 *
 * Each published page is fetched from this same server and saved as plain
 * HTML next to a stylesheet and the images it uses, so the download opens by
 * double-clicking index.html and can be dropped onto any static host as-is.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: {
      pages: {
        where: { published: true },
        orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Where the folder will be put online, when the operator has said; see
  // `lib/site-address`. Checked again on the way out, as everything written
  // into a page is.
  const siteUrl = cleanSiteUrl(site.siteUrl);

  if (site.pages.length === 0) {
    return NextResponse.json(
      { error: "This site has no published pages yet. Publish a page, then download." },
      { status: 409 },
    );
  }

  // File name per page, kept unique in case a slug collides with index.html.
  // The site's "not found" page is 404.html, which is the name Netlify, GitHub
  // Pages, Cloudflare Pages and most plain servers look for; it is claimed
  // first, so a page that happens to be called "404" cannot take it.
  const taken = new Set<string>();
  const pageFiles = new Map<string, string>();
  const notFound = site.pages.find((p) => p.isNotFound && !p.isHome);
  if (notFound) {
    taken.add(NOT_FOUND_FILE);
    pageFiles.set(notFound.slug, NOT_FOUND_FILE);
  }
  for (const page of site.pages) {
    if (page === notFound) continue;
    let name = pageFileName(page.slug, page.isHome);
    if (taken.has(name)) {
      const base = name.replace(/\.html$/, "");
      let n = 2;
      while (taken.has(`${base}-${n}.html`)) n += 1;
      name = `${base}-${n}.html`;
    }
    taken.add(name);
    pageFiles.set(page.slug, name);
  }

  // Loopback and plain http, never `new URL(req.url).origin`: Next takes the
  // scheme of that from `X-Forwarded-Proto`, so behind the TLS proxy the
  // install guide recommends this fetched its own plaintext port over TLS and
  // every download died with an unhandled 500.
  const origin = internalOrigin();
  const documents: string[] = [];
  const assetPaths = new Set<string>();
  const entries: (ZipEntry | ZipFileEntry)[] = [];

  for (const page of site.pages) {
    const url = page.isHome
      ? `${origin}/sites/${site.slug}`
      : `${origin}/sites/${site.slug}/${page.slug}`;
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (err) {
      // The fetch used to be unguarded, so anything it threw came back as a
      // 500 with an empty body instead of the 502 this route means.
      return NextResponse.json(
        { error: `Could not reach this server to render "${page.title}" (${String(err)}).` },
        { status: 502 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not render "${page.title}" (${res.status}).` },
        { status: 502 },
      );
    }

    let html: string;
    let assets: string[];
    try {
      ({ html, assets } = prepareExportedPage(await res.text(), {
        siteSlug: site.slug,
        pages: pageFiles,
        stylesheetHref: STYLESHEET_PATH,
        // Where the page just fetched thinks it lives: the loopback address
        // it was asked at, or PUBLIC_URL when the operator set one.
        selfOrigins: [origin, publicOrigin()],
        siteUrl,
      }));
    } catch (err) {
      // One page the exporter cannot prepare should name itself rather than
      // taking the whole download down anonymously.
      return NextResponse.json(
        { error: `Could not prepare "${page.title}" for export (${String(err)}).` },
        { status: 502 },
      );
    }
    // A host shows 404.html at whatever address went nowhere, however deep —
    // `/shop/old/thing` — and every address in it is relative to the folder,
    // so from there its stylesheet and pictures would be looked for under
    // `/shop/old/`. Anchored to the site's folder they are found wherever it
    // is shown: the root, or the folder the site's address names.
    if (page === notFound) {
      html = html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}<base href="${basePathOf(siteUrl)}">`);
    }
    // The page's link to the feed names the builder's address for it; in the
    // folder the feed sits beside the page.
    html = html.split(`/sites/${site.slug}/feed.xml`).join(FEED_FILE);
    // Where the site is going is known: the addresses a search engine and a
    // link preview read are written out in full.
    if (siteUrl) html = absoluteHeadLinks(html, siteUrl);
    assets.forEach((a) => assetPaths.add(a));
    documents.push(html);
    entries.push({ path: pageFiles.get(page.slug)!, data: Buffer.from(html, "utf8") });
  }

  // A page renamed after it was published leaves a forwarding page at its
  // old file name, for the links to it that the rename could not reach. Only
  // where the old name is free: a page that has since taken the address is
  // the one a visitor should find there.
  const forwards: string[] = [];
  const formerAddresses = await prisma.pageRedirect.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    select: { fromSlug: true, pageId: true },
  });
  for (const former of formerAddresses) {
    const target = site.pages.find((p) => p.id === former.pageId);
    const to = target ? pageFiles.get(target.slug) : undefined;
    if (!target || !to) continue;
    const name = pageFileName(former.fromSlug, false);
    if (taken.has(name)) continue;
    taken.add(name);
    forwards.push(name);
    // In the language of the page it sends a visitor to, as that page is.
    const forward = forwardingPage({ to, title: target.title, language: pageLanguage(target, site.language || "en") });
    const html = siteUrl ? absoluteHeadLinks(forward, siteUrl) : forward;
    entries.push({ path: name, data: Buffer.from(html, "utf8") });
  }

  // A bundled font goes out with its licence. The SIL Open Font License lets
  // anyone copy the files onto their own site on the one condition that the
  // licence travels with them, and a download is exactly such a copy.
  for (const rel of [...assetPaths]) {
    const id = /^fonts\/([a-z0-9-]+)\//.exec(rel)?.[1];
    if (id && BUNDLED_FONTS.some((font) => font.id === id)) assetPaths.add(`fonts/${id}/OFL.txt`);
  }

  // Images and uploads the pages point at, copied in beside them.
  const missingAssets: string[] = [];
  for (const rel of assetPaths) {
    const full = assetFile(rel);
    if (!full) {
      missingAssets.push(rel);
      continue;
    }
    try {
      // A regular file, never a link. Nothing in the app creates one, but a
      // shared volume or a restored backup can, and `ln -s .env
      // uploads/link.png` used to put the environment file into the
      // customer's download.
      const stats = await lstat(full);
      if (!stats.isFile()) throw new Error("not a regular file");
      // Named rather than read: the archive reads it as it is sent. A video
      // can be 250 MB now, and every file used to be held in memory at once.
      entries.push({ path: rel, file: full, size: stats.size });
    } catch {
      missingAssets.push(rel);
    }
  }

  // The feed, when the site has posts: Atom, which resolves its links against
  // its own address, so the same file works wherever the folder is put.
  const posts = postItems(site.pages, site.slug);
  if (posts.length > 0) {
    // Full addresses when the site's is known, which a feed reader that was
    // handed the feed alone can follow; relative ones otherwise.
    const at = (file: string) => (siteUrl ? addressOf(siteUrl, file) : file);
    const xml = atomFeed({
      siteId: site.id,
      siteName: site.name,
      homeHref: at("index.html"),
      selfHref: at(FEED_FILE),
      hrefOf: (post) => at(pageFiles.get(post.slug) ?? "index.html"),
      posts,
    });
    entries.push({ path: FEED_FILE, data: Buffer.from(xml, "utf8") });
  }

  const css = await buildExportCss(documents);
  entries.push({ path: STYLESHEET_PATH, data: Buffer.from(css, "utf8") });
  // A crawler looks for these the moment the folder is hosted. The sitemap's
  // entries have to be full addresses, so it is only written once the site's
  // address has been given; the "not found" page and the forwarding pages are
  // not pages anyone should be sent to, and are left out of it.
  const sitemap = siteUrl
    ? sitemapXml(
        site.pages
          .filter((p) => p !== notFound)
          .map((p) => ({ loc: addressOf(siteUrl, pageFiles.get(p.slug)!), lastmod: p.updatedAt, priority: p.isHome ? "1.0" : "0.8" })),
      )
    : null;
  if (sitemap) entries.push({ path: SITEMAP_FILE, data: Buffer.from(sitemap, "utf8") });
  entries.push({ path: "robots.txt", data: Buffer.from(robotsTxt(true, siteUrl ? addressOf(siteUrl, SITEMAP_FILE) : undefined), "utf8") });
  entries.push({
    path: "README.txt",
    data: Buffer.from(readme(site.name, [...pageFiles.values()], missingAssets, posts.length > 0, forwards, siteUrl), "utf8"),
  });

  const zip = zipStream(entries);
  if (!zip) {
    return NextResponse.json(
      {
        error:
          `The pages and files of this site come to more than ${Math.floor(MAX_ZIP_BYTES / 1024 ** 3)} GB, ` +
          "more than a download can hold. Take out a few of the largest videos and try again.",
      },
      { status: 413 },
    );
  }
  return new NextResponse(zip.stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${site.slug}.zip"`,
      "content-length": String(zip.length),
    },
  });
}

function readme(
  siteName: string,
  files: string[],
  missingAssets: string[],
  hasFeed = false,
  forwards: string[] = [],
  siteUrl: string | null = null,
): string {
  const lines = [
    `${siteName}`,
    `Exported from Neuravex on ${new Date().toISOString().slice(0, 10)}`,
    "",
    "WHAT'S IN HERE",
    "",
    "  index.html         your home page — double-click it to view the site",
    ...files.filter((f) => f !== "index.html" && f !== NOT_FOUND_FILE).map((f) => `  ${f.padEnd(18)} a page of the site`),
    "  assets/site.css    every style the pages use",
    "  uploads/, stock/   the images the pages point at",
    "  fonts/             the typefaces the pages use, each with its licence",
    "  robots.txt         tells search engines they may read the site",
    ...(siteUrl ? ["  sitemap.xml        every page's full address, for search engines"] : []),
    ...(hasFeed ? ["  feed.xml           the blog's posts, newest first, for a feed reader"] : []),
    ...(files.includes(NOT_FOUND_FILE)
      ? ["  404.html           what a visitor sees at an address that finds nothing;", "                     most hosts pick it up by its name"]
      : []),
    ...forwards.map((f) => `  ${f.padEnd(18)} a page's old address, forwarding to where it is now`),
    "",
    "PUTTING IT ONLINE",
    "",
    "  These are plain files. Upload the whole folder to any static host",
    "  (Netlify, GitHub Pages, S3, or an ordinary web server) and the site",
    "  works as-is. No build step and nothing to install.",
    "",
    "WORTH KNOWING",
    "",
    "  - Forms are included but switched off: a static file has nowhere to",
    "    send an answer, and a form that looks live would have put every",
    "    visitor's words into the address bar and your host's access log.",
    "    Point the form at a form-handling service, or keep using the builder,",
    "    where submissions are stored for you.",
    "  - Images added by URL rather than uploaded still load from wherever",
    "    they live, so those pages need an internet connection.",
    "  - Only published pages are exported. Drafts stay in the builder.",
    ...(files.includes(NOT_FOUND_FILE)
      ? [
          `  - 404.html finds its stylesheet and pictures from ${basePathOf(siteUrl)} on the`,
          "    host, so it looks right when the site is put at that address.",
        ]
      : []),
    ...(siteUrl
      ? [
          `  - The pages give ${siteUrl}/ as the site's address, to search`,
          "    engines and to link previews. Put the folder there, or change the",
          "    address in the site's settings and download it again.",
        ]
      : [
          "  - A sitemap is not included, and search engines are given each",
          "    page's address relative to the folder: the address the site will",
          "    have is not known. Give it in the site's settings (SEO) and",
          "    download again for both.",
        ]),
  ];
  if (missingAssets.length > 0) {
    lines.push(
      "",
      "MISSING FILES",
      "",
      "  These were referenced but are no longer in the media library, so the",
      "  pages using them will show a broken image:",
      ...missingAssets.map((a) => `    ${a}`),
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * The file on disk behind an `uploads/…`, `stock/…` or `fonts/…` reference,
 * or null.
 *
 * Uploads live outside `public/` (see `src/lib/uploads.ts`); the bundled stock
 * photographs and fonts are part of the application and still ship inside it.
 */
function assetFile(rel: string): string | null {
  const slash = rel.indexOf("/");
  if (slash === -1) return null;
  const dir = rel.slice(0, slash);
  const name = rel.slice(slash + 1);

  if (dir === "uploads") return existingUploadPath(name);

  const publicDir = join(process.cwd(), "public");
  const full = resolve(publicDir, rel);
  return full.startsWith(publicDir + sep) ? full : null;
}
