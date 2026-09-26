/**
 * Finding words across a whole site, and changing them everywhere at once.
 *
 * A phone number written into a site is written into it a dozen times: the
 * header of the contact page, a button, the footer, an FAQ answer, a line in
 * a pricing plan. Changing it meant opening every page, reading every block,
 * and hoping nothing was missed — and the one missed was the one a customer
 * rang. This finds every place a piece of text is, shows each, and changes the
 * ones chosen.
 *
 * Only words are changed, never markup. Most of a block's text is inline HTML,
 * and a search for `a` run over the source would have found every link and
 * rewritten `<a href>` itself. So the text between tags is searched, with the
 * entities it is written with read as the characters they stand for — "Fish
 * & chips" finds "Fish &amp; chips" — and a replacement is written back
 * escaped. Words split across formatting ("Open <b>daily</b>") are not found
 * as one; that is the price of never touching a tag.
 *
 * Pure: the route reads the pages and writes what comes back.
 */
import type { BaseBlock, MediaItem } from "@/types";
import { mapRichText } from "./rich-text-props";
import { getBlockDefinition } from "./blocks";
import { linksOf, retargetLinks } from "./page-links";
import { mailHref, normalizeFooter, telHref, type FooterDesign } from "./footer";
import { normalizeMenu, type MenuEntry } from "./menu";

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

/** The longest search there is. */
export const MAX_QUERY = 200;

/** The query as a pattern that matches it literally, or null when there is nothing to find. */
export function findPattern(query: string, { matchCase = false, wholeWord = false }: FindOptions = {}): RegExp | null {
  if (typeof query !== "string" || !query || query.length > MAX_QUERY) return null;
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A word is letters and digits in any script, so "Straße" is one word and
  // "café" does not end at its accent.
  const source = wholeWord ? `(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])` : literal;
  return new RegExp(source, matchCase ? "gu" : "giu");
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

function encode(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** How many times the pattern is in plain text, and the text with it replaced when a replacement is given. */
export function replaceInText(text: string, pattern: RegExp, replacement: string | null): { text: string; count: number } {
  let count = 0;
  const out = text.replace(pattern, (match) => {
    count += 1;
    return replacement === null ? match : replacement;
  });
  return { text: replacement === null ? text : out, count };
}

/**
 * The same, in inline HTML: only in the words between tags, read with their
 * entities undone and written back escaped. Text the pattern is not in is
 * left exactly as it was.
 */
export function replaceInHtml(html: string, pattern: RegExp, replacement: string | null): { html: string; count: number } {
  let count = 0;
  const out = html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith("<")) return part;
      const words = decode(part);
      const found = replaceInText(words, pattern, replacement);
      if (found.count === 0) return part;
      count += found.count;
      return replacement === null ? part : encode(found.text);
    })
    .join("");
  return { html: replacement === null ? html : out, count };
}

/** A few words either side of the first match, for the list of results. */
export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export function snippetOf(text: string, pattern: RegExp): Snippet | null {
  const plain = decode(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
  const probe = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  const found = probe.exec(plain);
  if (!found) return null;
  const start = Math.max(0, found.index - 40);
  const end = Math.min(plain.length, found.index + found[0].length + 40);
  return {
    before: `${start > 0 ? "…" : ""}${plain.slice(start, found.index)}`,
    match: found[0],
    after: `${plain.slice(found.index + found[0].length, end)}${end < plain.length ? "…" : ""}`,
  };
}

/**
 * The links that carry the text searched for in a form the words do not.
 *
 * A phone number is written twice on most pages that have one: as the words
 * "01234 567 890" and as a "Call us" button, or a linked number in a
 * paragraph, whose address is `tel:01234567890`. Changing the words and not
 * the link left a button that rang the old number, which is worse than a page
 * that says it, because nobody reads an address. So a search that is a phone
 * number finds the `tel:` links to the same digits, one that is an email
 * address finds the `mailto:` links to it, and a replacement that is a number
 * or an address as well rewrites them. A replacement that is not ("ring the
 * office") leaves the links as they were, since a `tel:` link has to go
 * somewhere.
 */
export interface ContactLinks {
  matches: (href: string) => boolean;
  /** A link's new address given its bare address, or null to leave it alone. */
  rewrite: (bare: string) => string | null;
}

const PHONE = /^\+?[\d\s().\-/]+$/;
const digitsOf = (text: string) => text.replace(/\D/g, "");

export function contactLinks(query: string, replacement: string | null): ContactLinks | null {
  const q = typeof query === "string" ? query.trim() : "";
  if (PHONE.test(q) && digitsOf(q).length >= 5) {
    const want = digitsOf(q);
    const matches = (href: string) => /^tel:/i.test(href) && digitsOf(href.slice(4).split(/[?#]/, 1)[0]) === want;
    const to = replacement !== null && PHONE.test(replacement.trim()) ? telHref(replacement.trim()) : null;
    return { matches, rewrite: (bare) => (to && matches(bare) ? to : null) };
  }
  if (mailHref(q)) {
    const want = q.toLowerCase();
    const matches = (href: string) => /^mailto:/i.test(href) && href.slice(7).split("?", 1)[0].toLowerCase() === want;
    const to = replacement !== null ? mailHref(replacement.trim()) : null;
    return { matches, rewrite: (bare) => (to && matches(bare) ? to : null) };
  }
  return null;
}

/** The snippet a link shows in the list of results, which has no words of its own. */
function linkSnippet(href: string): Snippet {
  return { before: "Links to ", match: href.replace(/^(tel|mailto):/i, ""), after: "" };
}

/** Plain-text props a block keeps beside its rich text: what a picture shows, for one. */
function plainFields(block: BaseBlock): { key: string; get: () => string; set: (value: string) => BaseBlock }[] {
  const p = (block.props ?? {}) as Record<string, unknown>;
  const out: { key: string; get: () => string; set: (value: string) => BaseBlock }[] = [];
  if (block.type === "image" && typeof p.alt === "string") {
    out.push({ key: "alt", get: () => p.alt as string, set: (alt) => ({ ...block, props: { ...p, alt, altFromLibrary: false } }) });
  }
  for (const listKey of block.type === "gallery" ? ["images"] : block.type === "slider" ? ["slides"] : []) {
    const list = Array.isArray(p[listKey]) ? (p[listKey] as MediaItem[]) : [];
    list.forEach((item, i) => {
      if (typeof item?.alt !== "string") return;
      out.push({
        key: `${listKey}.${i}.alt`,
        get: () => item.alt,
        set: (alt) => ({ ...block, props: { ...p, [listKey]: list.map((x, j) => (j === i ? { ...x, alt, altFromLibrary: false } : x)) } }),
      });
    });
  }
  return out;
}

/** One block's own words — not its children's — searched and, given a replacement, replaced. */
function inBlock(
  block: BaseBlock,
  pattern: RegExp,
  replacement: string | null,
  contact: ContactLinks | null,
): { block: BaseBlock; count: number; snippet: Snippet | null } {
  let count = 0;
  let snippet: Snippet | null = null;
  const note = (text: string, found: number) => {
    count += found;
    if (found && !snippet) snippet = snippetOf(text, pattern);
  };
  let props = mapRichText(block.type, block.props ?? {}, (html) => {
    const found = replaceInHtml(html, pattern, replacement);
    note(html, found.count);
    return found.html;
  });
  // A Custom HTML block's words, between its tags like any other.
  if (block.type === "html" && typeof props.html === "string") {
    const found = replaceInHtml(props.html, pattern, replacement);
    note(props.html, found.count);
    if (found.html !== props.html) props = { ...props, html: found.html };
  }
  let next: BaseBlock = props === block.props ? block : { ...block, props };
  for (const field of plainFields(next)) {
    const text = field.get();
    const found = replaceInText(text, pattern, replacement);
    note(text, found.count);
    if (replacement !== null && found.count) next = field.set(found.text);
  }
  if (contact) {
    const linked = linksOf(next).filter(contact.matches);
    if (linked.length) {
      count += linked.length;
      snippet ??= linkSnippet(linked[0]);
      if (replacement !== null) {
        // Rewritten on the block alone: its children are searched as blocks of their own.
        const { children, ...alone } = next;
        const moved = retargetLinks([alone], contact.rewrite);
        if (moved.changed) next = children ? { ...moved.blocks[0], children } : moved.blocks[0];
      }
    }
  }
  return { block: next, count, snippet };
}

export interface BlockMatch {
  blockId: string;
  /** What the block is, as the palette names it. */
  label: string;
  count: number;
  snippet: Snippet;
  /** The synced block this is, or is inside, when there is one; see `synced-blocks`. */
  synced?: string;
}

/** Every block the pattern is found in, in page order. */
export function findInTree(blocks: BaseBlock[], pattern: RegExp, contact: ContactLinks | null = null): BlockMatch[] {
  const out: BlockMatch[] = [];
  const walk = (list: BaseBlock[], within: string | undefined) => {
    for (const block of list) {
      const synced = block.synced ?? within;
      const found = inBlock(block, pattern, null, contact);
      if (found.count && found.snippet) {
        out.push({
          blockId: block.id,
          label: getBlockDefinition(block.type)?.label ?? block.type,
          count: found.count,
          snippet: found.snippet,
          ...(synced ? { synced } : {}),
        });
      }
      if (block.children) walk(block.children, synced);
    }
  };
  walk(blocks, undefined);
  return out;
}

/**
 * The ids of every block that is one of the synced blocks named, or inside
 * one.
 *
 * A synced block is one block shown on several pages, and saving any copy of
 * it rewrites all the others to match. Replacing the words in the copy on one
 * page and not in the copy on the next would have had the second page's old
 * words written back over the first as soon as the second was saved; so a
 * copy chosen anywhere is replaced everywhere, and the list of results says so.
 */
export function blocksInSynced(blocks: BaseBlock[], synced: Set<string>): string[] {
  const out: string[] = [];
  const walk = (list: BaseBlock[], inside: boolean) => {
    for (const block of list) {
      const within = inside || (!!block.synced && synced.has(block.synced));
      if (within) out.push(block.id);
      if (block.children) walk(block.children, within);
    }
  };
  walk(blocks, false);
  return out;
}

/**
 * The tree with the pattern replaced in every block, or only in the blocks
 * named in `only`, and how many were replaced. Blocks with nothing to change
 * are returned as they were.
 */
export function replaceInTree(
  blocks: BaseBlock[],
  pattern: RegExp,
  replacement: string,
  only?: Set<string>,
  contact: ContactLinks | null = null,
): { blocks: BaseBlock[]; count: number } {
  let count = 0;
  const walk = (list: BaseBlock[]): BaseBlock[] =>
    list.map((block) => {
      let next = block;
      if (!only || only.has(block.id)) {
        const found = inBlock(block, pattern, replacement, contact);
        count += found.count;
        next = found.block;
      }
      if (block.children) {
        const children = walk(block.children);
        if (children.some((c, i) => c !== block.children![i])) next = { ...next, children };
      }
      return next;
    });
  const out = walk(blocks);
  return { blocks: count ? out : blocks, count };
}

/**
 * Words kept outside the blocks — a page's title and search text, the site's
 * name, menu and footer — as places to look, each with a key the route and
 * the list of results share and a way to write it back.
 */
interface Slot {
  key: string;
  label: string;
  value: string;
  /** Inline HTML, searched between its tags; otherwise plain text. */
  html?: boolean;
  /** A link's address, matched and rewritten only as a phone number or email address; see `contactLinks`. */
  link?: boolean;
  set: (value: string) => void;
}

/** One place on the site, as the route lists it and the dashboard shows it. */
export interface FindResult {
  /** `page:<id>:block:<blockId>`, `page:<id>:<field>` or `site:<place>`, which a replace names back. */
  key: string;
  pageId: string | null;
  pageTitle: string | null;
  label: string;
  count: number;
  snippet: Snippet;
  /** In a synced block, so replacing it here replaces it on every page that has it. */
  synced?: boolean;
}

export interface FieldMatch {
  key: string;
  label: string;
  count: number;
  snippet: Snippet;
}

function findInSlots(slots: Slot[], pattern: RegExp, contact: ContactLinks | null): FieldMatch[] {
  const out: FieldMatch[] = [];
  for (const slot of slots) {
    if (slot.link) {
      if (contact?.matches(slot.value)) out.push({ key: slot.key, label: slot.label, count: 1, snippet: linkSnippet(slot.value) });
      continue;
    }
    const count = slot.html ? replaceInHtml(slot.value, pattern, null).count : replaceInText(slot.value, pattern, null).count;
    // Plain text is escaped first, so a `<` in it is not taken for a tag.
    const snippet = count ? snippetOf(slot.html ? slot.value : encode(slot.value), pattern) : null;
    if (count && snippet) out.push({ key: slot.key, label: slot.label, count, snippet });
  }
  return out;
}

function replaceInSlots(slots: Slot[], pattern: RegExp, replacement: string, only: Set<string>, contact: ContactLinks | null): number {
  let count = 0;
  for (const slot of slots) {
    if (!only.has(slot.key)) continue;
    if (slot.link) {
      const to = contact?.rewrite(slot.value.split(/[?#]/, 1)[0]);
      if (to) {
        slot.set(to + slot.value.slice(slot.value.split(/[?#]/, 1)[0].length));
        count += 1;
      }
      continue;
    }
    if (slot.html) {
      const found = replaceInHtml(slot.value, pattern, replacement);
      if (found.count) slot.set(found.html);
      count += found.count;
    } else {
      const found = replaceInText(slot.value, pattern, replacement);
      if (found.count) slot.set(found.text);
      count += found.count;
    }
  }
  return count;
}

/** A page's words that are not in its blocks. */
export interface PageWords {
  title: string;
  excerpt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const PAGE_FIELDS: [keyof PageWords, string][] = [
  ["title", "Page title"],
  ["excerpt", "Post summary"],
  ["metaTitle", "Search title"],
  ["metaDescription", "Search description"],
];

function pageSlots(draft: PageWords): Slot[] {
  return PAGE_FIELDS.flatMap(([key, label]) => {
    const value = draft[key];
    return typeof value === "string" && value ? [{ key, label, value, set: (v: string) => void (draft[key] = v) }] : [];
  });
}

export function findInPage(page: PageWords, pattern: RegExp): FieldMatch[] {
  return findInSlots(pageSlots({ ...page }), pattern, null);
}

/** The fields of the page that changed, ready to be written, and how many were replaced. */
export function replaceInPage(page: PageWords, pattern: RegExp, replacement: string, only: Set<string>): { patch: Partial<PageWords>; count: number } {
  const draft = { ...page };
  const count = replaceInSlots(pageSlots(draft), pattern, replacement, only, null);
  const patch: Partial<PageWords> = {};
  for (const [key] of PAGE_FIELDS) if (draft[key] !== page[key]) Object.assign(patch, { [key]: draft[key] });
  return { patch, count };
}

/** A site's words that are not on any page, as the site row stores them. */
export interface SiteWords {
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  headerHtml: string | null;
  footerHtml: string | null;
  menu: string | null;
  footer: string | null;
}

interface SiteDraft {
  fields: Record<"name" | "description" | "metaTitle" | "metaDescription" | "headerHtml" | "footerHtml", string | null>;
  menu: MenuEntry[];
  footer: FooterDesign | null;
}

function siteDraft(site: SiteWords): SiteDraft {
  return {
    fields: {
      name: site.name,
      description: site.description,
      metaTitle: site.metaTitle,
      metaDescription: site.metaDescription,
      headerHtml: site.headerHtml,
      footerHtml: site.footerHtml,
    },
    menu: normalizeMenu(site.menu),
    footer: normalizeFooter(site.footer),
  };
}

function siteSlots(draft: SiteDraft): Slot[] {
  const out: Slot[] = [];
  const text = (key: string, label: string, value: string | null | undefined, set: (v: string) => void, extra: Partial<Slot> = {}) => {
    if (typeof value === "string" && value) out.push({ key, label, value, set, ...extra });
  };
  const f = draft.fields;
  text("name", "Site name", f.name, (v) => (f.name = v));
  text("description", "Site description", f.description, (v) => (f.description = v));
  text("metaTitle", "Search title for the site", f.metaTitle, (v) => (f.metaTitle = v));
  text("metaDescription", "Search description for the site", f.metaDescription, (v) => (f.metaDescription = v));
  text("headerHtml", "Custom header", f.headerHtml, (v) => (f.headerHtml = v), { html: true });
  text("footerHtml", "Custom footer", f.footerHtml, (v) => (f.footerHtml = v), { html: true });

  const menuEntry = (entry: MenuEntry, key: string) => {
    text(`${key}.label`, "Menu item", entry.label, (v) => (entry.label = v));
    if (entry.kind === "link") text(`${key}.href`, "Menu link", entry.href, (v) => (entry.href = v), { link: true });
  };
  draft.menu.forEach((entry, i) => {
    menuEntry(entry, `menu.${i}`);
    entry.children?.forEach((child, j) => menuEntry(child, `menu.${i}.children.${j}`));
  });

  const footer = draft.footer;
  if (footer) {
    text("footer.about", "Footer: about the site", footer.about, (v) => (footer.about = v));
    text("footer.contact.address", "Footer: address", footer.contact.address, (v) => (footer.contact.address = v));
    text("footer.contact.phone", "Footer: phone", footer.contact.phone, (v) => (footer.contact.phone = v));
    text("footer.contact.email", "Footer: email", footer.contact.email, (v) => (footer.contact.email = v));
    text("footer.copyright", "Footer: copyright line", footer.copyright, (v) => (footer.copyright = v));
    footer.columns.forEach((column, i) => {
      text(`footer.columns.${i}.title`, "Footer: column heading", column.title, (v) => (column.title = v));
      column.links.forEach((link, j) => {
        text(`footer.columns.${i}.links.${j}.label`, "Footer: link", link.label, (v) => (link.label = v));
        text(`footer.columns.${i}.links.${j}.href`, "Footer: link address", link.href, (v) => (link.href = v), { link: true });
      });
    });
  }
  return out;
}

export function findInSite(site: SiteWords, pattern: RegExp, contact: ContactLinks | null = null): FieldMatch[] {
  return findInSlots(siteSlots(siteDraft(site)), pattern, contact);
}

/**
 * The site's settings that changed, as `normalizeSiteFields` takes them, and
 * how many were replaced. The menu and the footer come back whole when
 * anything in them changed, since they are stored whole.
 */
export function replaceInSite(
  site: SiteWords,
  pattern: RegExp,
  replacement: string,
  only: Set<string>,
  contact: ContactLinks | null = null,
): { patch: Record<string, unknown>; count: number } {
  const draft = siteDraft(site);
  const before = JSON.stringify(draft);
  const count = replaceInSlots(siteSlots(draft), pattern, replacement, only, contact);
  const patch: Record<string, unknown> = {};
  if (!count || JSON.stringify(draft) === before) return { patch, count: 0 };
  const was = siteDraft(site);
  for (const key of Object.keys(draft.fields) as (keyof SiteDraft["fields"])[]) {
    if (draft.fields[key] !== was.fields[key]) patch[key] = draft.fields[key];
  }
  if (JSON.stringify(draft.menu) !== JSON.stringify(was.menu)) patch.menu = draft.menu;
  if (JSON.stringify(draft.footer) !== JSON.stringify(was.footer)) patch.footer = draft.footer;
  return { patch, count };
}
