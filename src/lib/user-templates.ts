/**
 * Templates of one's own: a site or a page kept to start others from.
 *
 * There were the 28 built-in templates and nothing else. Somebody who had
 * built a site the way they like it — their colours, their header and footer,
 * a contact page laid out just so — started the next one from somebody else's
 * design and rebuilt theirs by hand, and a page they made again and again (an
 * event, a product, a case study) was duplicated from wherever the last copy
 * happened to be, which only works inside the one site.
 *
 * A site is kept as the archive the export and the trash use, every page and
 * setting included, and a new site made from it goes through the same door
 * an import does. A page is kept as its title and its blocks. Either can
 * carry links to the site it came from — a button to `/sites/bakery/contact`
 * — so the address it was saved from is kept too, and what is made from it
 * has those links moved to its own address.
 */
import { prisma } from "./prisma";
import { archiveOf, createSiteFromArchive } from "./site-copy";
import { isSiteArchive, type SiteArchive } from "./site-archive";
import { normalizeBlockTree, normalizeBlockTreeJson } from "./block-tree";
import { moveSite, retargetLinksInContent } from "./page-links";
import type { BaseBlock } from "@/types";

export type UserTemplateKind = "site" | "page";

export const MAX_TEMPLATE_NAME = 120;

/** A name for a template, tidied, or the fallback when nothing is left of it. */
export function templateName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_TEMPLATE_NAME) : "";
  return name || fallback.slice(0, MAX_TEMPLATE_NAME) || "Untitled template";
}

/** Keeps a site as a template. Null when there is no such site. */
export async function saveSiteTemplate(siteId: string, name: unknown) {
  const archive = await archiveOf(siteId);
  if (!archive) return null;
  return prisma.userTemplate.create({
    data: {
      name: templateName(name, String(archive.site.name ?? "")),
      kind: "site",
      content: JSON.stringify(archive),
      fromSlug: String(archive.site.slug ?? ""),
    },
    select: { id: true, name: true, kind: true },
  });
}

/** Keeps a page as a template, blocks and title. Null when there is no such page. */
export async function savePageTemplate(pageId: string, name: unknown) {
  const page = await prisma.page.findUnique({ where: { id: pageId }, include: { site: { select: { slug: true } } } });
  if (!page) return null;
  const tree = normalizeBlockTreeJson(page.content || "[]");
  return prisma.userTemplate.create({
    data: {
      name: templateName(name, page.title),
      kind: "page",
      content: JSON.stringify({ title: page.title, content: tree.ok ? tree.json : "[]" }),
      fromSlug: page.site.slug,
    },
    select: { id: true, name: true, kind: true },
  });
}

/** The site archive a site template holds, or null when it is not one. */
function siteArchiveOf(content: string): SiteArchive | null {
  try {
    const value = JSON.parse(content);
    return isSiteArchive(value) ? value : null;
  } catch {
    return null;
  }
}

/** The blocks a page template holds, validated, and the title it had. */
function pageTemplateOf(content: string): { title: string; json: string } | null {
  try {
    const value = JSON.parse(content) as { title?: unknown; content?: unknown };
    const tree = normalizeBlockTreeJson(typeof value.content === "string" ? value.content : "[]");
    return tree.ok ? { title: typeof value.title === "string" ? value.title : "", json: tree.json } : null;
  } catch {
    return null;
  }
}

/** A new site from a site template, under the name given. Null when there is no such template. */
export async function siteFromTemplate(templateId: string, name: string) {
  const template = await prisma.userTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.kind !== "site") return null;
  const archive = siteArchiveOf(template.content);
  if (!archive) return null;
  return createSiteFromArchive(archive, { name, fromSlug: template.fromSlug });
}

/**
 * A page template's blocks, as stored JSON, with its links moved from the
 * site it was saved from to the site it is going into. Null when there is no
 * such page template.
 */
export async function pageContentFromTemplate(templateId: string, siteSlug: string): Promise<string | null> {
  const template = await prisma.userTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.kind !== "page") return null;
  const page = pageTemplateOf(template.content);
  if (!page) return null;
  if (!template.fromSlug || template.fromSlug === siteSlug) return page.json;
  return retargetLinksInContent(page.json, moveSite(template.fromSlug, siteSlug)).content;
}

/** What the choosers show for each template: its name, and a first page to draw as a preview. */
export async function listTemplates(kind: UserTemplateKind) {
  const rows = await prisma.userTemplate.findMany({ where: { kind }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => {
    let preview: BaseBlock[] = [];
    let pageCount = 1;
    if (kind === "site") {
      const archive = siteArchiveOf(row.content);
      const first = archive?.pages.find((p) => p.isHome) ?? archive?.pages[0];
      const tree = normalizeBlockTree(typeof first?.content === "string" ? first.content : "[]");
      preview = tree.ok ? tree.tree : [];
      pageCount = archive?.pages.length ?? 0;
    } else {
      const page = pageTemplateOf(row.content);
      const tree = normalizeBlockTree(page?.json ?? "[]");
      preview = tree.ok ? tree.tree : [];
    }
    return { id: row.id, name: row.name, kind: row.kind, createdAt: row.createdAt, pageCount, preview };
  });
}
