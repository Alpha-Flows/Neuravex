/**
 * What is worth fixing before a site goes out.
 *
 * Every one of these was something the builder already knew and never said.
 * A picture with no description was read out to a blind visitor as its file
 * name, or as nothing. A button left on its template's `#` went nowhere, on a
 * page that looked finished. A link to the Contact page that was still a
 * draft was a 404 for every visitor who pressed it, and one to a page since
 * deleted was a 404 too. A page with no search description got whatever
 * sentence a search engine picked out of it. A heading that jumped from
 * level 2 to level 4 left a screen reader's list of headings with a hole in
 * it. And a 9 MB photograph was 9 MB on every phone that opened the page.
 *
 * Each finding names its page and, where it has one, its block, so the list
 * can take the author straight to it. Nothing here changes anything: it is a
 * list to read before publishing, not a gate in front of it.
 *
 * Pure: the route reads the site and the files and hands them in.
 */
import type { BaseBlock, ImageProps, MediaItem } from "@/types";
import { isInternalLink, linksOf, targetOf, type LinkTarget } from "./page-links";
import { anchorOfHref, sectionAnchors } from "./anchors";
import { normalizeMenu, type MenuEntry } from "./menu";
import { normalizeFooter } from "./footer";

export type FindingKind = "alt" | "link" | "section" | "nowhere" | "description" | "heading" | "heavy-image";

export interface Finding {
  kind: FindingKind;
  /** A problem is something a visitor will run into; a suggestion is worth a look. */
  severity: "problem" | "suggestion";
  /** The page it is on; null for the site's menu or footer. */
  pageId: string | null;
  /** The block to open, when it is one block's. */
  blockId?: string;
  message: string;
}

export interface CheckPage {
  id: string;
  title: string;
  slug: string;
  isHome: boolean;
  published: boolean;
  isPost: boolean;
  isNotFound: boolean;
  legalKind: string | null;
  metaDescription: string | null;
  blocks: BaseBlock[];
}

export interface CheckSite {
  slug: string;
  description: string | null;
  metaDescription: string | null;
  menu: string | null;
  footer: string | null;
  /** Old addresses still forwarding, by old slug, to the page's id; see `afterRename`. */
  formerSlugs: Map<string, string>;
}

/** What is known about an uploaded picture: its weight, its size, and what it is called. */
export interface ImageFacts {
  bytes: number;
  width?: number | null;
  name?: string;
}

/**
 * A picture heavier than this is worth making lighter. Past a megabyte and a
 * half a photograph costs a visitor on a phone connection whole seconds, and
 * one made lighter on the way in is a few hundred kilobytes at most.
 */
export const HEAVY_BYTES = 1.5 * 1024 * 1024;
/** Wider than any screen draws it, twice over. */
export const HEAVY_WIDTH = 3000;

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plain(html: unknown): string {
  return typeof html === "string" ? html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() : "";
}

/** `what`, followed by the thing's own words in quotes when it has some: `the button “Book now”`. */
function named(what: string, text: string): string {
  const words = text.replace(/\s+/g, " ").trim();
  if (!words) return what;
  return `${what} “${words.length > 40 ? `${words.slice(0, 39)}…` : words}”`;
}

/** Blocks in the order a reader meets them. */
function* inOrder(blocks: BaseBlock[]): Generator<BaseBlock> {
  for (const block of blocks) {
    yield block;
    if (block.children) yield* inOrder(block.children);
  }
}

/** Every picture a block shows, with where it sits, for the weight check. */
function picturesOf(block: BaseBlock): string[] {
  const p = block.props ?? {};
  const out: string[] = [];
  if (block.type === "image" && typeof p.src === "string") out.push(p.src);
  if (block.type === "gallery" && Array.isArray(p.images)) out.push(...(p.images as MediaItem[]).map((i) => i.src));
  if (block.type === "slider" && Array.isArray(p.slides)) out.push(...(p.slides as MediaItem[]).map((i) => i.src));
  if (block.type === "section" && typeof p.backgroundImage === "string") out.push(p.backgroundImage);
  if (block.type === "columns" && Array.isArray(p.columnStyles)) {
    for (const style of p.columnStyles) if (style && typeof style.backgroundImage === "string") out.push(style.backgroundImage);
  }
  return out.filter((src) => typeof src === "string" && src.length > 0);
}

/**
 * Where a link inside the site goes wrong, if it does: a page that does not
 * exist, one that is a draft, or a section the page it names does not have.
 */
function linkTrouble(
  href: string,
  site: CheckSite,
  from: CheckPage | null,
  pages: CheckPage[],
  targets: LinkTarget[],
): { severity: Finding["severity"]; kind: FindingKind; message: string } | null {
  // The section named after the `#`, on this page or on the one the path names.
  const hash = href.indexOf("#");
  const anchor = hash === -1 ? "" : anchorOfHref(href.slice(hash));
  // A link to a section of the page it is on.
  if (href.startsWith("#")) {
    if (!anchor || !from) return null;
    const own = sectionAnchors(from.blocks).some((a) => a.anchor === anchor);
    return own ? null : { severity: "problem", kind: "section", message: `A link goes to a section called “${anchor}”, and this page has no section by that name.` };
  }
  if (!isInternalLink(href, site.slug)) return null;
  const target = targetOf(href, site.slug, targets);
  if (!target) {
    const slug = href.split(/[?#]/, 1)[0].replace(`/sites/${site.slug}`, "").replace(/^\/+|\/+$/g, "");
    const forwardsTo = site.formerSlugs.get(slug);
    const now = forwardsTo ? pages.find((p) => p.id === forwardsTo) : undefined;
    if (now) {
      return {
        severity: "suggestion",
        kind: "link",
        message: `A link goes to /${slug}, an old address of “${now.title}”. It forwards there, but can go straight to the page.`,
      };
    }
    return { severity: "problem", kind: "link", message: `A link goes to /${slug || ""}, which is not a page of this site. Visitors will get “not found”.` };
  }
  const page = pages.find((p) => p.slug === target.slug);
  if (!target.published) {
    return { severity: "problem", kind: "link", message: `A link goes to “${target.title}”, which is still a draft. Visitors will get “not found” until it is published.` };
  }
  if (anchor && page && !sectionAnchors(page.blocks).some((a) => a.anchor === anchor)) {
    return { severity: "problem", kind: "section", message: `A link goes to a section called “${anchor}” on “${target.title}”, which has no section by that name.` };
  }
  return null;
}

/** Everything worth fixing on one page. */
export function checkPage(
  page: CheckPage,
  site: CheckSite,
  pages: CheckPage[],
  images: Map<string, ImageFacts>,
): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "pageId">) => findings.push({ ...f, pageId: page.id });
  const targets: LinkTarget[] = pages.map((p) => ({ slug: p.slug, title: p.title, isHome: p.isHome, published: p.published }));

  // A post's header draws its title as the page's first heading, level 1.
  let previous = page.isPost ? 1 : 0;
  const weighed = new Set<string>();

  for (const block of inOrder(page.blocks)) {
    const p = block.props ?? {};

    if (block.type === "image" && (p as ImageProps).src && !plain((p as ImageProps).alt)) {
      add({ kind: "alt", severity: "problem", blockId: block.id, message: "A picture has no description for visitors who cannot see it." });
    }
    if (block.type === "gallery" || block.type === "slider") {
      const items = ((block.type === "gallery" ? p.images : p.slides) ?? []) as MediaItem[];
      const bare = items.filter((i) => i?.src && !plain(i.alt)).length;
      if (bare > 0) {
        const what = block.type === "gallery" ? "gallery" : "slider";
        add({
          kind: "alt",
          severity: "problem",
          blockId: block.id,
          message: bare === 1 ? `A picture in a ${what} has no description.` : `${bare} pictures in a ${what} have no description.`,
        });
      }
    }

    if (block.type === "button" && (!p.href || p.href === "#")) {
      add({ kind: "nowhere", severity: "problem", blockId: block.id, message: `${named("The button", plain(p.label))} goes nowhere: its link is “#”.` });
    }
    if (block.type === "pricing" && Array.isArray(p.plans)) {
      for (const plan of p.plans as { name?: string; buttonLabel?: string; buttonHref?: string }[]) {
        if (plain(plan?.buttonLabel) && (!plan.buttonHref || plan.buttonHref === "#")) {
          add({ kind: "nowhere", severity: "problem", blockId: block.id, message: `${named("The button on the plan", plain(plan.name))} goes nowhere: its link is “#”.` });
        }
      }
    }

    for (const href of linksOf(block)) {
      const trouble = linkTrouble(href, site, page, pages, targets);
      if (trouble) add({ ...trouble, blockId: block.id });
    }

    // A generated legal page is written again from the details behind it,
    // so its outline is not the author's to fix here.
    if (block.type === "heading" && !page.legalKind) {
      const level = Math.min(4, Math.max(1, Number(p.level) || 2));
      if (level > previous + 1) {
        const skipped = previous === 0 ? "the page has no heading above it" : `it follows a level ${previous} heading`;
        add({
          kind: "heading",
          severity: "suggestion",
          blockId: block.id,
          message: `${named("The heading", plain(p.text))} is level ${level}, but ${skipped}. Screen readers list headings by level, and a missing one leaves a gap.`,
        });
      }
      previous = level;
    }

    for (const src of picturesOf(block)) {
      const facts = images.get(src.split(/[?#]/, 1)[0]);
      if (!facts || weighed.has(src)) continue;
      weighed.add(src);
      const heavy = facts.bytes > HEAVY_BYTES;
      const wide = (facts.width ?? 0) > HEAVY_WIDTH;
      if (!heavy && !wide) continue;
      const name = facts.name ? `“${facts.name}”` : "A picture";
      const why = heavy && wide ? `${megabytes(facts.bytes)} and ${facts.width} pixels wide` : heavy ? megabytes(facts.bytes) : `${facts.width} pixels wide`;
      add({
        kind: "heavy-image",
        severity: "suggestion",
        blockId: block.id,
        message: `${name} is ${why}. Upload it again with “Make pictures lighter” on, and phones are sent a copy their size.`,
      });
    }
  }

  // A page nobody searches for — the "not found" page, the generated legal
  // pages — needs no description of its own.
  if (!page.isNotFound && !page.legalKind && !plain(page.metaDescription) && !plain(site.metaDescription) && !plain(site.description)) {
    findings.push({
      kind: "description",
      severity: "suggestion",
      pageId: page.id,
      message: "No search description, for this page or the site. A search engine will pick a sentence from the page instead.",
    });
  }

  return findings;
}

/** The links in the site's menu and laid-out footer that go nowhere. */
export function checkChrome(site: CheckSite, pages: CheckPage[]): Finding[] {
  const targets: LinkTarget[] = pages.map((p) => ({ slug: p.slug, title: p.title, isHome: p.isHome, published: p.published }));
  const findings: Finding[] = [];
  const hrefs = (entries: MenuEntry[]): string[] =>
    entries.flatMap((e) => [...(e.kind === "link" && e.href ? [e.href] : []), ...hrefs(e.children ?? [])]);
  for (const href of hrefs(normalizeMenu(site.menu))) {
    const trouble = linkTrouble(href, site, null, pages, targets);
    if (trouble) findings.push({ ...trouble, pageId: null, message: `In the menu: ${trouble.message}` });
  }
  const footer = normalizeFooter(site.footer);
  for (const column of footer?.columns ?? []) {
    for (const link of column.links) {
      const trouble = linkTrouble(link.href, site, null, pages, targets);
      if (trouble) findings.push({ ...trouble, pageId: null, message: `In the footer: ${trouble.message}` });
    }
  }
  return findings;
}

/** The whole site: its menu and footer first, then each page in turn. */
export function checkSite(site: CheckSite, pages: CheckPage[], images: Map<string, ImageFacts>): Finding[] {
  return [...checkChrome(site, pages), ...pages.flatMap((page) => checkPage(page, site, pages, images))];
}
