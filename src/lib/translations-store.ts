/**
 * Translations as the database keeps them: which pages are one page in
 * several languages, and the three things an author does to that — make a
 * translation, say an existing page is one, or say a page is not.
 *
 * A group is a key the member pages share; see `lib/translations`. It holds
 * one page per language, and every write here keeps it that way, because the
 * switcher and `hreflang` can only point one way for each language and would
 * otherwise pick between two pages without saying so.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeBlockTree } from "./block-tree";
import { mapBlocks } from "./tree-utils";
import { freePageSlug } from "./page-rename";
import { builderLanguageName, cleanLanguage, pageLanguage, sameLanguage } from "./translations";
import { currentVersion } from "./page-version";
import type { BaseBlock } from "@/types";

export interface TranslationRow {
  id: string;
  title: string;
  slug: string;
  /** The page's language, the site's when it names none. */
  language: string;
  published: boolean;
}

export interface TranslationState {
  siteLanguage: string;
  /**
   * The page's version once the change is made: linking a translation writes
   * this page too, and the editor that asked for it must not then take its
   * own next save for somebody else's; see `lib/page-version`.
   */
  version: string;
  /** The page itself and its translations, the page first. */
  group: TranslationRow[];
  /** Pages that could be linked as a translation: ones in a language the group has not got. */
  candidates: TranslationRow[];
}

type PageRow = {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  language: string | null;
  translationGroup: string | null;
  published: boolean;
  legalKind: string | null;
  isNotFound: boolean;
};

const PAGE_SELECT = {
  id: true,
  siteId: true,
  title: true,
  slug: true,
  language: true,
  translationGroup: true,
  published: true,
  legalKind: true,
  isNotFound: true,
} as const;

async function load(pageId: string): Promise<{ page: PageRow; siteLanguage: string; pages: PageRow[] } | null> {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: PAGE_SELECT });
  if (!page) return null;
  const site = await prisma.site.findUnique({ where: { id: page.siteId }, select: { language: true } });
  const pages = await prisma.page.findMany({
    where: { siteId: page.siteId },
    orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
    select: PAGE_SELECT,
  });
  return { page, siteLanguage: site?.language || "en", pages };
}

function row(p: PageRow, siteLanguage: string): TranslationRow {
  return { id: p.id, title: p.title, slug: p.slug, language: pageLanguage(p, siteLanguage), published: p.published };
}

/** The page's translations and what could join them, for the settings panel. */
export async function translationState(pageId: string): Promise<TranslationState | null> {
  const found = await load(pageId);
  if (!found) return null;
  const { page, siteLanguage, pages } = found;
  const members = page.translationGroup ? pages.filter((p) => p.id !== page.id && p.translationGroup === page.translationGroup) : [];
  const group = [page, ...members].map((p) => row(p, siteLanguage));
  const taken = group.map((r) => r.language);
  // The legal pages and the "not found" page have no translations to offer:
  // the one is written in the law's language, the other is not a page a
  // reader goes to.
  const candidates = pages
    .filter((p) => p.id !== page.id && !p.legalKind && !p.isNotFound && !members.some((m) => m.id === p.id))
    .map((p) => row(p, siteLanguage))
    .filter((r) => !taken.some((l) => sameLanguage(l, r.language)));
  return { siteLanguage, version: (await currentVersion(page.id)) ?? "", group, candidates };
}

export type TranslationOutcome = { ok: true; state: TranslationState; createdId?: string } | { ok: false; error: string; status: number };

async function done(pageId: string, createdId?: string): Promise<TranslationOutcome> {
  const state = await translationState(pageId);
  return state ? { ok: true, state, ...(createdId ? { createdId } : {}) } : { ok: false, error: "Not found", status: 404 };
}

/**
 * A new draft page in `language`, a copy of this one to translate, joined to
 * its group.
 *
 * The copy is detached from every synced block it contains. A synced block
 * is the same on every page it is on, and translating the German copy's
 * words would otherwise have written them into the English page it came from.
 */
export async function makeTranslation(pageId: string, rawLanguage: unknown): Promise<TranslationOutcome> {
  const language = cleanLanguage(rawLanguage);
  if (!language) return { ok: false, error: "That is not a language code, such as de or pt-BR.", status: 400 };
  const found = await load(pageId);
  if (!found) return { ok: false, error: "Not found", status: 404 };
  const { page, siteLanguage, pages } = found;
  if (page.legalKind || page.isNotFound) {
    return { ok: false, error: "This page is not one that is translated.", status: 400 };
  }
  const group = page.translationGroup ?? page.id;
  const members = pages.filter((p) => p.id === page.id || (page.translationGroup && p.translationGroup === page.translationGroup));
  if (members.some((p) => sameLanguage(pageLanguage(p, siteLanguage), language))) {
    return { ok: false, error: `This page already has a ${builderLanguageName(language)} version.`, status: 409 };
  }

  const full = await prisma.page.findUnique({ where: { id: page.id } });
  if (!full) return { ok: false, error: "Not found", status: 404 };
  const tree = normalizeBlockTree(full.content || "[]");
  const blocks = mapBlocks(tree.ok ? tree.tree : [], (b: BaseBlock) => {
    if (!b.synced) return b;
    const rest = { ...b };
    delete rest.synced;
    return rest;
  });
  // A home page's translation lives at the language's own address — /de —
  // and any other page's beside the original, with the language after it.
  const slug = await freePageSlug(page.siteId, full.isHome ? language.toLowerCase() : `${full.slug}-${language.toLowerCase()}`);

  const created = await prisma.$transaction(async (tx) => {
    if (!page.translationGroup) await tx.page.update({ where: { id: page.id }, data: { translationGroup: group } });
    return tx.page.create({
      data: {
        siteId: page.siteId,
        title: full.title,
        slug,
        content: JSON.stringify(blocks),
        published: false,
        isHome: false,
        isPost: full.isPost,
        postDate: full.postDate,
        author: full.author,
        excerpt: full.excerpt,
        coverImage: full.coverImage,
        tags: full.tags,
        sortOrder: full.sortOrder,
        metaTitle: full.metaTitle,
        metaDescription: full.metaDescription,
        ogImage: full.ogImage,
        language: sameLanguage(language, siteLanguage) ? null : language,
        translationGroup: group,
      },
      select: { id: true },
    });
  });
  return done(page.id, created.id);
}

/**
 * Say that `otherId` is this page in another language. It leaves any group
 * it was in; one whose language this page's group already has is refused
 * rather than quietly replacing the page there.
 */
export async function linkTranslation(pageId: string, otherId: unknown): Promise<TranslationOutcome> {
  if (typeof otherId !== "string" || !otherId || otherId === pageId) {
    return { ok: false, error: "Which page is the translation?", status: 400 };
  }
  const found = await load(pageId);
  if (!found) return { ok: false, error: "Not found", status: 404 };
  const { page, siteLanguage, pages } = found;
  const other = pages.find((p) => p.id === otherId);
  if (!other) return { ok: false, error: "That page is not part of this site.", status: 400 };
  if (other.legalKind || other.isNotFound || page.legalKind || page.isNotFound) {
    return { ok: false, error: "That page is not one that is translated.", status: 400 };
  }
  const group = page.translationGroup ?? page.id;
  const members = pages.filter((p) => p.id === page.id || (page.translationGroup && p.translationGroup === page.translationGroup));
  const language = pageLanguage(other, siteLanguage);
  if (members.some((p) => p.id !== other.id && sameLanguage(pageLanguage(p, siteLanguage), language))) {
    return {
      ok: false,
      error: `This page already has a ${builderLanguageName(language)} version. Give the other page a different language first.`,
      status: 409,
    };
  }
  await prisma.$transaction(async (tx) => {
    if (!page.translationGroup) await tx.page.update({ where: { id: page.id }, data: { translationGroup: group } });
    await tx.page.update({ where: { id: other.id }, data: { translationGroup: group } });
    await tidy(tx, other.translationGroup, group);
  });
  return done(page.id);
}

/** Take this page out of its group: it is nobody's translation any more. */
export async function unlinkTranslation(pageId: string): Promise<TranslationOutcome> {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { translationGroup: true } });
  if (!page) return { ok: false, error: "Not found", status: 404 };
  await prisma.$transaction(async (tx) => {
    await tx.page.update({ where: { id: pageId }, data: { translationGroup: null } });
    await tidy(tx, page.translationGroup);
  });
  return done(pageId);
}

/**
 * A group left with a single page is no group: its key is taken off that
 * page, so a lone page does not go on looking as though it had translations.
 */
async function tidy(tx: Prisma.TransactionClient, group: string | null, except?: string): Promise<void> {
  if (!group || group === except) return;
  const left = await tx.page.findMany({ where: { translationGroup: group }, select: { id: true } });
  if (left.length === 1) await tx.page.update({ where: { id: left[0].id }, data: { translationGroup: null } });
}

/**
 * What a save that changes a page's language does to its group: a language
 * another page of the group already has takes this page out of it, for the
 * same reason `linkTranslation` refuses one.
 */
export async function languageChange(
  page: { id: string; siteId: string; translationGroup: string | null },
  language: string | null,
): Promise<{ language: string | null; translationGroup?: null }> {
  if (!page.translationGroup) return { language };
  const site = await prisma.site.findUnique({ where: { id: page.siteId }, select: { language: true } });
  const siteLanguage = site?.language || "en";
  const others = await prisma.page.findMany({
    where: { siteId: page.siteId, translationGroup: page.translationGroup, id: { not: page.id } },
    select: { language: true },
  });
  const effective = language ?? siteLanguage;
  const clash = others.some((o) => sameLanguage(pageLanguage(o, siteLanguage), effective));
  if (!clash) return { language };
  if (others.length === 1) {
    await prisma.page.updateMany({ where: { siteId: page.siteId, translationGroup: page.translationGroup }, data: { translationGroup: null } });
  }
  return { language, translationGroup: null };
}
