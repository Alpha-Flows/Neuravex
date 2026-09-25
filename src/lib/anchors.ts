/**
 * Named sections, and links that go straight to one.
 *
 * Most of the templates are one long page — a hero, the services, the prices,
 * a contact form — and there was no way to put "Prices" in a button and have
 * it scroll there. An `#anchor` could be typed into a link, but nothing on the
 * page carried the id it named. A section can now be given a name, which it
 * carries as its id, and the link picker lists the named sections of this
 * page and of every other page of the site.
 *
 * The id is the name with `c-` in front, the prefix the sanitiser already puts
 * on every id and every `#fragment` link inside authored text. So a link typed
 * by hand into a paragraph as `#prices`, which the sanitiser stores as
 * `#c-prices`, lands on the section named "prices" as surely as one picked
 * from the list.
 *
 * No dependencies: the inspector and the link picker read this.
 */
import type { BaseBlock } from "@/types";

/** The prefix the sanitiser gives authored ids and fragment links; see `sanitize.ts`. */
export const ANCHOR_PREFIX = "c-";

/** The longest a section's name may be. Long enough for a phrase, short enough for an address. */
export const MAX_ANCHOR = 60;

/**
 * A section's name as it can appear in an address: lower case, letters,
 * digits and dashes, no dash at either end. "Our team" becomes "our-team".
 * Empty when nothing usable is left.
 */
export function cleanAnchor(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ANCHOR)
    .replace(/-+$/, "");
}

/** The id a section named `anchor` carries. */
export function anchorId(anchor: string): string {
  return `${ANCHOR_PREFIX}${anchor}`;
}

/** The link to a named section of the page the link is on. */
export function anchorHref(anchor: string): string {
  return `#${anchorId(anchor)}`;
}

/**
 * A same-page link as the page's ids are written.
 *
 * Text already goes through the sanitiser, which puts the prefix on a typed
 * `#prices`; a button's address and a menu link do not, so `#prices` typed
 * there named an id no element has. The same prefix is put on here. A bare
 * `#` is the top of the page and is left alone, as is anything already
 * prefixed and the ids the blocks draw for themselves, which begin `nvx-`.
 */
export function fragmentLink(href: string): string {
  if (!href.startsWith("#") || href.length === 1) return href;
  const id = href.slice(1);
  return id.startsWith(ANCHOR_PREFIX) || id.startsWith("nvx-") ? href : `#${ANCHOR_PREFIX}${id}`;
}

/** The section name a same-page link points at, or "" when it is not one. */
export function anchorOfHref(href: string): string {
  const link = fragmentLink(href);
  return link.startsWith(`#${ANCHOR_PREFIX}`) ? link.slice(ANCHOR_PREFIX.length + 1) : "";
}

export interface PageAnchor {
  anchor: string;
  /** The first heading inside the section, as plain text, so the list says what is there. */
  title: string;
  /** The section that has the name — the first, when two share it. */
  blockId?: string;
}

/** Text without its markup, for a label. */
function plain(html: unknown): string {
  return typeof html === "string"
    ? html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
    : "";
}

/** The first heading in a list of blocks, however deep. */
function firstHeading(blocks: BaseBlock[] | undefined): string {
  for (const block of blocks ?? []) {
    if (block.type === "heading") {
      const text = plain(block.props?.text);
      if (text) return text;
    }
    const inner = firstHeading(block.children);
    if (inner) return inner;
  }
  return "";
}

/**
 * Every named section in a tree, in page order, each name once — a second
 * section given a name already taken can never be linked to, since a link
 * lands on the first.
 */
export function sectionAnchors(blocks: BaseBlock[]): PageAnchor[] {
  const out: PageAnchor[] = [];
  const walk = (list: BaseBlock[] | undefined) => {
    for (const block of list ?? []) {
      const anchor = block.type === "section" ? cleanAnchor(block.props?.anchor) : "";
      if (anchor && !out.some((a) => a.anchor === anchor)) out.push({ anchor, title: firstHeading(block.children), blockId: block.id });
      walk(block.children);
    }
  };
  walk(blocks);
  return out;
}
