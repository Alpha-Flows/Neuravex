import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeSite } from "@/lib/site-archive";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/export — the whole site as JSON, for re-importing.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: { pages: { orderBy: { sortOrder: "asc" } } },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(serializeSite(site), {
    headers: { "content-disposition": `attachment; filename="${site.slug}.json"` },
  });
}
