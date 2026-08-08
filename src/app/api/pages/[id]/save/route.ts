import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

interface SaveBody {
  title?: string;
  slug?: string;
  published?: boolean;
  isHome?: boolean;
  content?: unknown; // BaseBlock[] tree
}

// Persist the full page (title, slug, flags, and the entire block tree as JSON).
export async function PUT(req: NextRequest, { params }: Params) {
  const body = (await req.json().catch(() => ({}))) as SaveBody;
  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.published === "boolean") data.published = body.published;
  if (typeof body.isHome === "boolean") {
    data.isHome = body.isHome;
    // Unset home on all other pages in the same site to keep only one home page.
    if (body.isHome) {
      await prisma.page.updateMany({
        where: { siteId: page.siteId, id: { not: page.id }, isHome: true },
        data: { isHome: false },
      });
    }
  }
  if (body.content !== undefined) data.content = JSON.stringify(body.content);

  const updated = await prisma.page.update({ where: { id: params.id }, data });

  // Snapshot a revision after every save
  if (body.content !== undefined || typeof body.title === "string") {
    await prisma.revision.create({
      data: {
        pageId: page.id,
        title: (typeof body.title === "string" ? body.title.trim() : page.title) || "Untitled",
        content: body.content !== undefined ? JSON.stringify(body.content) : page.content,
      },
    });
  }

  return NextResponse.json(updated);
}
