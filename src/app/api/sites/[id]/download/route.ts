import { NextRequest, NextResponse } from "next/server";
import { lstat, readFile } from "fs/promises";
import { join, resolve, sep } from "path";
import { existingUploadPath } from "@/lib/uploads";
import { prisma } from "@/lib/prisma";
import { createZip, ZipEntry } from "@/lib/zip";
import { buildExportCss } from "@/lib/export-css";
import { pageFileName, prepareExportedPage } from "@/lib/static-export";
import { robotsTxt } from "@/lib/seo";
import { internalOrigin } from "@/lib/self-origin";

export const dynamic = "force-dynamic";

const STYLESHEET_PATH = "assets/site.css";

/**
 * GET /api/sites/[id]/download — the site as a folder of files, zipped.
 *
 * Each published page is fetched from this same server and saved as plain
 * HTML next to a stylesheet and the images it uses, so the download opens by
 * double-clicking index.html and can be dropped onto any static host as-is.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

  if (site.pages.length === 0) {
    return NextResponse.json(
      { error: "This site has no published pages yet. Publish a page, then download." },
      { status: 409 },
    );
  }

  // File name per page, kept unique in case a slug collides with index.html.
  const taken = new Set<string>();
  const pageFiles = new Map<string, string>();
  for (const page of site.pages) {
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
  const entries: ZipEntry[] = [];

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
      }));
    } catch (err) {
      // One page the exporter cannot prepare should name itself rather than
      // taking the whole download down anonymously.
      return NextResponse.json(
        { error: `Could not prepare "${page.title}" for export (${String(err)}).` },
        { status: 502 },
      );
    }
    assets.forEach((a) => assetPaths.add(a));
    documents.push(html);
    entries.push({ path: pageFiles.get(page.slug)!, data: Buffer.from(html, "utf8") });
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
      entries.push({ path: rel, data: await readFile(full) });
    } catch {
      missingAssets.push(rel);
    }
  }

  const css = await buildExportCss(documents);
  entries.push({ path: STYLESHEET_PATH, data: Buffer.from(css, "utf8") });
  // A crawler looks for this the moment the folder is hosted. The sitemap is
  // left out on purpose: its entries have to be absolute, and the address this
  // ends up on is not known here.
  entries.push({ path: "robots.txt", data: Buffer.from(robotsTxt(true), "utf8") });
  entries.push({
    path: "README.txt",
    data: Buffer.from(readme(site.name, [...pageFiles.values()], missingAssets), "utf8"),
  });

  const zip = createZip(entries);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${site.slug}.zip"`,
      "content-length": String(zip.length),
    },
  });
}

function readme(siteName: string, files: string[], missingAssets: string[]): string {
  const lines = [
    `${siteName}`,
    `Exported from Neuravex on ${new Date().toISOString().slice(0, 10)}`,
    "",
    "WHAT'S IN HERE",
    "",
    "  index.html         your home page — double-click it to view the site",
    ...files.filter((f) => f !== "index.html").map((f) => `  ${f.padEnd(18)} a page of the site`),
    "  assets/site.css    every style the pages use",
    "  uploads/, stock/   the images the pages point at",
    "  robots.txt         tells search engines they may read the site",
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
    "  - A sitemap is not included: its entries must be full addresses, and",
    "    the address this folder ends up on is not known yet. Neuravex serves",
    "    one at /sites/<site>/sitemap.xml while you are building.",
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
 * The file on disk behind an `uploads/…` or `stock/…` reference, or null.
 *
 * Uploads live outside `public/` (see `src/lib/uploads.ts`); the bundled stock
 * photographs are part of the application and still ship inside it.
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
