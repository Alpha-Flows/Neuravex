import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";
import { listTemplates, savePageTemplate, saveSiteTemplate } from "@/lib/user-templates";

export const dynamic = "force-dynamic";

/** GET /api/user-templates?kind=site|page — the templates somebody saved. */
export async function GET(req: NextRequest) {
  const kind = new URL(req.url).searchParams.get("kind") === "page" ? "page" : "site";
  return NextResponse.json(await listTemplates(kind));
}

/**
 * POST /api/user-templates — `{ siteId, name }` keeps a site, `{ pageId, name }`
 * keeps a page; see `lib/user-templates.ts`.
 */
export async function POST(req: NextRequest) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const saved =
    typeof body.siteId === "string"
      ? await saveSiteTemplate(body.siteId, body.name)
      : typeof body.pageId === "string"
        ? await savePageTemplate(body.pageId, body.name)
        : undefined;
  if (saved === undefined) return NextResponse.json({ error: "Say which site or page to keep." }, { status: 400 });
  if (saved === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(saved, { status: 201 });
}
