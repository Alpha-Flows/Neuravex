import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { createZip, ZipEntry } from "@/lib/zip";
import { buildExportCss } from "@/lib/export-css";
import { pageFileName, prepareExportedPage } from "@/lib/static-export";

export const dynamic = "force-dynamic";

const STYLESHEET_PATH = "assets/site.css";

/**
 * GET /api/sites/[id]/download — the site as a folder of files, zipped.
 *
 * Each published page is fetched from this same server and saved as plain
 * HTML next to a stylesheet and the images it uses, so the download opens by
 * double-clicking index.html and can be dropped onto any static host as-is.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

  const origin = new URL(req.url).origin;
  const documents: string[] = [];
  const assetPaths = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const page of site.pages) {
    const url = page.isHome
      ? `${origin}/sites/${site.slug}`
      : `${origin}/sites/${site.slug}/${page.slug}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not render "${page.title}" (${res.status}).` },
        { status: 502 },
      );
    }

    const { html, assets } = prepareExportedPage(await res.text(), {
      siteSlug: site.slug,
      pages: pageFiles,
      stylesheetHref: STYLESHEET_PATH,
    });
    assets.forEach((a) => assetPaths.add(a));
    documents.push(html);
    entries.push({ path: pageFiles.get(page.slug)!, data: Buffer.from(html, "utf8") });
  }

  // Images and uploads the pages point at, copied in beside them.
  const missingAssets: string[] = [];
  for (const rel of assetPaths) {
    try {
      entries.push({ path: rel, data: await readFile(join(process.cwd(), "public", rel)) });
    } catch {
      missingAssets.push(rel);
    }
  }

  const css = await buildExportCss(documents);
  entries.push({ path: STYLESHEET_PATH, data: Buffer.from(css, "utf8") });
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
    "",
    "PUTTING IT ONLINE",
    "",
    "  These are plain files. Upload the whole folder to any static host",
    "  (Netlify, GitHub Pages, S3, or an ordinary web server) and the site",
    "  works as-is. No build step and nothing to install.",
    "",
    "WORTH KNOWING",
    "",
    "  - Forms are included, but a static file has nowhere to send an answer.",
    "    Point the form at a form-handling service, or keep using the builder,",
    "    where submissions are stored for you.",
    "  - Images added by URL rather than uploaded still load from wherever",
    "    they live, so those pages need an internet connection.",
    "  - Only published pages are exported. Drafts stay in the builder.",
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
