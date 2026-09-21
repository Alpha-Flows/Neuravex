import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyLegalPages } from "@/lib/legal/apply";
import { auditSite } from "@/lib/legal/audit";
import { isLegalKind } from "@/lib/legal/pages";
import { legalProfileSchema, missingFor, parseProfile } from "@/lib/legal/profile";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** The details on file, what is still missing, and what the site itself does. */
export async function GET(_req: NextRequest, { params }: Params) {
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    select: {
      legal: true,
      headerHtml: true,
      footerHtml: true,
      favicon: true,
      ogImage: true,
      language: true,
      pages: {
        select: { id: true, title: true, slug: true, content: true, legalKind: true, published: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const profile = parseProfile(site.legal);
  const ordinary = site.pages.filter((p) => !isLegalKind(p.legalKind));

  const audit = auditSite({
    pages: ordinary.map((p) => ({ title: p.title, content: p.content })),
    headerHtml: site.headerHtml,
    footerHtml: site.footerHtml,
    favicon: site.favicon,
    ogImage: site.ogImage,
  });

  return NextResponse.json({
    profile,
    // The question about form submissions is only asked when there is a form.
    missing: missingFor(profile, { hasForm: audit.hasForm }),
    audit,
    language: site.language,
    // What a contact form on this site would be reachable at, so the flow can
    // offer it as the second fast contact route § 5 Abs. 1 Nr. 2 DDG wants.
    contactPages: ordinary
      .filter((p) => p.published)
      .map((p) => ({ slug: p.slug, title: p.title })),
    generated: site.pages
      .filter((p) => isLegalKind(p.legalKind))
      .map((p) => ({ id: p.id, kind: p.legalKind, slug: p.slug, title: p.title, published: p.published })),
  });
}

/**
 * Save what has been filled in so far.
 *
 * The flow saves as it goes, so a half-filled profile is normal and is stored
 * without complaint; `missing` comes back with it, and generating is what
 * checks. Losing an address because somebody closed the tab at step three is
 * the failure worth avoiding here.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => null);
  const parsed = legalProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "These details are not in a shape this can store." }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.site.update({ where: { id: params.id }, data: { legal: JSON.stringify(parsed.data) } });
  return NextResponse.json({ profile: parsed.data, missing: missingFor(parsed.data, { hasForm: await siteHasForm(params.id) }) });
}

/** Write both documents onto the site, creating or rewriting the two pages. */
export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => null);
  const site = await prisma.site.findUnique({ where: { id: params.id }, select: { legal: true } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generating from details that were just typed is the common case, so the
  // body wins over what is on file — and is stored, so the two never diverge.
  let profile = parseProfile(site.legal);
  if (body) {
    const parsed = legalProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "These details are not in a shape this can store." }, { status: 400 });
    }
    profile = parsed.data;
    await prisma.site.update({ where: { id: params.id }, data: { legal: JSON.stringify(profile) } });
  }

  const missing = missingFor(profile, { hasForm: await siteHasForm(params.id) });
  if (missing.length > 0) {
    // A document with a blank where the address belongs is worse than no
    // document, because it looks finished.
    return NextResponse.json(
      { error: "Some details the law asks for are still missing.", missing },
      { status: 422 },
    );
  }

  const { applied, audit } = await applyLegalPages(params.id, profile);
  return NextResponse.json({ applied, audit, missing: [] });
}

/** Whether any ordinary page on this site carries a form block. */
async function siteHasForm(siteId: string): Promise<boolean> {
  const pages = await prisma.page.findMany({
    where: { siteId },
    select: { title: true, content: true, legalKind: true },
  });
  return auditSite({
    pages: pages.filter((p) => !isLegalKind(p.legalKind)).map((p) => ({ title: p.title, content: p.content })),
  }).hasForm;
}
