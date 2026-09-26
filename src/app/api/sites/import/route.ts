import { NextRequest, NextResponse } from "next/server";
import { slugify } from "@/lib/utils";
import { isSiteArchive, MAX_ARCHIVE_PAGES } from "@/lib/site-archive";
import { createSiteFromArchive } from "@/lib/site-copy";
import { readJsonObject, IMPORT_BODY_LIMIT } from "@/lib/request-body";

export const dynamic = "force-dynamic";

// POST /api/sites/import — rebuild a site from an exported archive.
export async function POST(req: NextRequest) {
  // An archive carries a whole site, so it gets more room than an ordinary
  // request — but it used to have no cap at all, and the body was parsed in
  // full before anything looked at it.
  const parsed = await readJsonObject(req, IMPORT_BODY_LIMIT);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;
  if (!isSiteArchive(body)) {
    return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  }

  if (body.pages.length > MAX_ARCHIVE_PAGES) {
    return NextResponse.json(
      { error: `That archive has more than ${MAX_ARCHIVE_PAGES} pages, so it was not imported.` },
      { status: 413 },
    );
  }

  const wanted =
    typeof body.site.slug === "string" && body.site.slug ? body.site.slug : String(body.site.name ?? "site");

  try {
    // Slugs de-duplicated, one home page, one page per legal kind (see
    // `normalizeArchivePages`), and — through `createSiteFromArchive` — every
    // link moved when the address it came from is already taken. An import
    // used to keep the links as they were, so a site imported beside the one
    // it was exported from sent every button back into the original.
    const site = await createSiteFromArchive(body, {
      name: String(body.site.name ?? "Imported site").slice(0, 300) || "Imported site",
      fromSlug: typeof body.site.slug === "string" ? body.site.slug : undefined,
      slug: slugify(wanted) || "site",
      keepAddress: true,
    });
    return NextResponse.json(site, { status: 201 });
  } catch {
    // A malformed archive used to reach Prisma and come back as a 500 with an
    // empty body, which tells the person holding the file nothing.
    return NextResponse.json({ error: "That archive could not be imported." }, { status: 400 });
  }
}
