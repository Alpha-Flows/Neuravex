import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { isSiteArchive, siteCreateData, pageCreateData } from "@/lib/site-archive";
import { freeSiteSlug } from "@/lib/restore";

export const dynamic = "force-dynamic";

// POST /api/sites/import — rebuild a site from an exported archive.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!isSiteArchive(body)) {
    return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  }

  const wanted = typeof body.site.slug === "string" && body.site.slug ? body.site.slug : String(body.site.name);
  const site = await prisma.site.create({
    data: {
      ...siteCreateData(body),
      slug: await freeSiteSlug(slugify(wanted)),
      pages: { create: body.pages.map(pageCreateData) },
    },
  });

  return NextResponse.json(site, { status: 201 });
}
