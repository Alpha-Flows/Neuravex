import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeBlockTree } from "@/lib/block-tree";
import { normalizeSiteFields } from "@/lib/site-fields";
import { readJsonObject } from "@/lib/request-body";
import { snapshotRevision } from "@/lib/revisions";
import { keepAsVersion } from "@/lib/page-version";
import { settleSyncedBlocks } from "@/lib/synced-store";
import { isLegalKind } from "@/lib/legal/pages";
import {
  MAX_QUERY,
  blocksInSynced,
  contactLinks,
  findInPage,
  findInSite,
  findInTree,
  findPattern,
  replaceInPage,
  replaceInSite,
  replaceInTree,
  type FindResult,
} from "@/lib/find-replace";

export const dynamic = "force-dynamic";

/**
 * The most places one search lists. A search for "the" on a site of forty
 * pages found every paragraph on it, and a list of four thousand is not one
 * anybody reads — so the first of them are shown, the list says there are
 * more, and replacing those and searching again reaches the rest.
 */
const MAX_RESULTS = 500;

/** The longest replacement: a paragraph's worth, not a page's. */
const MAX_REPLACEMENT = MAX_QUERY * 5;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/find — every place on the site a piece of text is,
 * and, given `replace` and the `keys` of the places chosen, the text changed
 * in those places; see `lib/find-replace`.
 *
 * Each page changed is kept in its history first, as a version named for the
 * search, so a replace that caught more than was meant is one restore away.
 * The generated legal pages are listed and never changed: they are rewritten
 * from the legal details whenever those change, which would put the old words
 * straight back.
 */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const query = typeof body.query === "string" ? body.query : "";
  const pattern = findPattern(query, { matchCase: body.matchCase === true, wholeWord: body.wholeWord === true });
  if (!pattern) {
    return NextResponse.json({ error: `Type what to look for, up to ${MAX_QUERY} characters.` }, { status: 400 });
  }
  const replacement = typeof body.replace === "string" ? body.replace : null;
  if (replacement !== null && replacement.length > MAX_REPLACEMENT) {
    return NextResponse.json({ error: `The replacement can be up to ${MAX_REPLACEMENT} characters.` }, { status: 400 });
  }

  const site = await prisma.site.findUnique({
    where: { id: params.id },
    select: {
      name: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
      headerHtml: true,
      footerHtml: true,
      menu: true,
      footer: true,
      pages: {
        orderBy: [{ isHome: "desc" }, { isPost: "asc" }, { sortOrder: "asc" }],
        select: { id: true, title: true, excerpt: true, metaTitle: true, metaDescription: true, content: true, legalKind: true },
      },
    },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contact = contactLinks(query, replacement);
  // Read through the validator, as every read of a page is.
  const pages = site.pages.map((page) => {
    const tree = normalizeBlockTree(page.content || "[]");
    return { page, blocks: tree.ok ? tree.tree : [] };
  });

  if (replacement === null) {
    const results: FindResult[] = findInSite(site, pattern, contact).map((f) => ({
      key: `site:${f.key}`,
      pageId: null,
      pageTitle: null,
      label: f.label,
      count: f.count,
      snippet: f.snippet,
    }));
    const legal: { pageId: string; title: string; count: number }[] = [];
    for (const { page, blocks } of pages) {
      const fields = findInPage(page, pattern);
      const inBlocks = findInTree(blocks, pattern, contact);
      if (isLegalKind(page.legalKind)) {
        const count = [...fields, ...inBlocks].reduce((n, f) => n + f.count, 0);
        if (count) legal.push({ pageId: page.id, title: page.title, count });
        continue;
      }
      const at = { pageId: page.id, pageTitle: page.title };
      for (const f of fields) results.push({ key: `page:${page.id}:${f.key}`, ...at, label: f.label, count: f.count, snippet: f.snippet });
      for (const b of inBlocks) {
        results.push({
          key: `page:${page.id}:block:${b.blockId}`,
          ...at,
          label: b.label,
          count: b.count,
          snippet: b.snippet,
          ...(b.synced ? { synced: true } : {}),
        });
      }
    }
    const shown = results.slice(0, MAX_RESULTS);
    return NextResponse.json({
      results: shown,
      total: shown.reduce((n, r) => n + r.count, 0),
      truncated: results.length > MAX_RESULTS,
      legal,
    });
  }

  const keys = new Set(Array.isArray(body.keys) ? body.keys.filter((k): k is string => typeof k === "string").slice(0, MAX_RESULTS * 2) : []);
  if (keys.size === 0) return NextResponse.json({ error: "Choose the places to replace it in." }, { status: 400 });

  const writable = pages.filter(({ page }) => !isLegalKind(page.legalKind));
  const chosenBlocks = (pageId: string) => {
    const prefix = `page:${pageId}:block:`;
    return new Set([...keys].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
  };
  // A synced block chosen on one page is chosen on all of them; see `blocksInSynced`.
  const synced = new Set<string>();
  for (const { page, blocks } of writable) {
    const mine = chosenBlocks(page.id);
    for (const match of findInTree(blocks, pattern, contact)) {
      if (match.synced && mine.has(match.blockId)) synced.add(match.synced);
    }
  }

  const name = `Before replacing “${query.length > 60 ? `${query.slice(0, 59)}…` : query}”`;
  let replaced = 0;
  let pagesChanged = 0;
  const failed: string[] = [];
  for (const { page, blocks } of writable) {
    const only = chosenBlocks(page.id);
    if (synced.size) for (const id of blocksInSynced(blocks, synced)) only.add(id);
    const prefix = `page:${page.id}:`;
    const fields = new Set([...keys].filter((k) => k.startsWith(prefix) && !k.startsWith(`${prefix}block:`)).map((k) => k.slice(prefix.length)));

    const inTree = only.size ? replaceInTree(blocks, pattern, replacement, only, contact) : { blocks, count: 0 };
    const inFields = fields.size ? replaceInPage(page, pattern, replacement, fields) : { patch: {}, count: 0 };
    if (!inTree.count && !inFields.count) continue;

    const data: Record<string, unknown> = {};
    if (typeof inFields.patch.title === "string") data.title = inFields.patch.title.trim() || page.title;
    for (const key of ["excerpt", "metaTitle", "metaDescription"] as const) {
      const value = inFields.patch[key];
      if (typeof value === "string") data[key] = value.trim() || null;
    }
    if (inTree.count) {
      // Written as every tree is: through the validator, and with the synced
      // copies on other pages brought along.
      const checked = normalizeBlockTree(inTree.blocks);
      if (!checked.ok) {
        failed.push(page.title);
        continue;
      }
      data.content = JSON.stringify((await settleSyncedBlocks(page.id, checked.tree, undefined)).tree);
    }

    await keepAsVersion(page.id, { title: page.title, content: page.content, name });
    const updated = await prisma.page.update({ where: { id: page.id }, data, select: { title: true, content: true } });
    await snapshotRevision(page.id, { title: updated.title, content: updated.content, manual: true });
    replaced += inTree.count + inFields.count;
    pagesChanged += 1;
  }

  const siteKeys = new Set([...keys].filter((k) => k.startsWith("site:")).map((k) => k.slice("site:".length)));
  let siteChanged = false;
  if (siteKeys.size) {
    const change = replaceInSite(site, pattern, replacement, siteKeys, contact);
    if (change.count) {
      await prisma.site.update({ where: { id: params.id }, data: normalizeSiteFields(change.patch) });
      replaced += change.count;
      siteChanged = true;
    }
  }

  return NextResponse.json({ replaced, pages: pagesChanged, site: siteChanged, failed });
}
