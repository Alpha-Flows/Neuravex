/**
 * Links from one page of a site to another.
 *
 * Two things were missing, and they are the same thing seen from either end.
 * Linking to your own Contact page meant typing `/sites/<site>/contact` from
 * memory into a free-text box, with nothing to check it against — and once
 * typed, renaming that page's address in Settings quietly turned every one of
 * those links into a 404. The nav survived a rename because it is built from
 * the pages themselves; everything an author wrote by hand did not.
 *
 * So links are addressed here rather than spelled: `pagePath` is the one place
 * that knows what a page's address looks like, and `retargetLinks` moves every
 * link that pointed at a page's old address over to its new one.
 */

import { BaseBlock } from "@/types";
import { mapRichText } from "./rich-text-props";

/** Where a page of this site lives. The home page is the bare site address. */
export function pagePath(siteSlug: string, pageSlug: string, isHome: boolean): string {
  const base = `/sites/${siteSlug}`;
  return isHome ? base : `${base}/${pageSlug}`;
}

/**
 * The props that hold a link, by block type. Only these are rewritten: an
 * image `src` or a video `src` is an address too, but it never points at a
 * page of this site.
 */
const LINK_PROPS: Partial<Record<BaseBlock["type"], string[]>> = {
  button: ["href"],
};

/**
 * Links a block keeps inside a list, as `[list prop, field]` — each pricing
 * plan's button, each social profile. `LINK_PROPS` only reaches a block's own
 * props, so a plan's "Choose Pro" pointing at the Contact page would have
 * been left behind by a rename that moved every button beside it.
 */
const NESTED_LINK_PROPS: Partial<Record<BaseBlock["type"], [string, string][]>> = {
  pricing: [["plans", "buttonHref"]],
  social: [["links", "href"]],
};

/**
 * How a link should be rewritten: the new path for this one, or null to leave
 * it alone. It is given the bare path — no query string, no fragment — and
 * those are put back afterwards, so a link to `/sites/x/about#team` keeps its
 * fragment through a rename.
 */
export type LinkMapper = (path: string) => string | null;

/** A path with any trailing slashes taken off, so `/a/` and `/a` compare equal. */
function trimSlashes(path: string): string {
  return path.replace(/\/+$/, "") || path;
}

/** A mapper that moves one exact address to another. */
export function movePath(from: string, to: string): LinkMapper {
  const target = trimSlashes(from);
  return (path) => (trimSlashes(path) === target ? to : null);
}

/**
 * A mapper that moves a whole site: every address under `/sites/<from>` to the
 * same place under `/sites/<to>`. Renaming a site in Settings used to leave
 * every link it contained pointing into the site's old address, which after
 * the rename is nobody's.
 */
export function moveSite(fromSlug: string, toSlug: string): LinkMapper {
  const base = `/sites/${fromSlug}`;
  return (path) => {
    if (path !== base && !path.startsWith(`${base}/`)) return null;
    return `/sites/${toSlug}${path.slice(base.length)}`;
  };
}

/** The part of an href before any query string or fragment. */
function barePath(href: string): string {
  return href.split(/[?#]/, 1)[0];
}

/** `href` rewritten by `map`, or null when the mapper passes on it. */
function remap(href: string, map: LinkMapper): string | null {
  if (typeof href !== "string" || !href) return null;
  const bare = barePath(href);
  const to = map(bare);
  return to === null || to === bare ? null : to + href.slice(bare.length);
}

/**
 * Every link inside `html` that addresses `from`, moved to `to`.
 *
 * Custom HTML is the other place an author writes a path by hand, and it is
 * the place they are least likely to remember having done so. Rich text is
 * the third: the formatting toolbar's link button writes `<a href>` into a
 * paragraph, an FAQ answer or a table cell, which the first version of the
 * sweep never looked in.
 */
export function retargetHtmlLinks(html: string, map: LinkMapper): string {
  return html.replace(/(href\s*=\s*)("|')([^"']*)\2/gi, (match, lead: string, quote: string, href: string) => {
    const next = remap(href, map);
    return next === null ? match : `${lead}${quote}${next}${quote}`;
  });
}

/**
 * A block tree with every link to `from` moved to `to`, and whether anything
 * moved. The tree is rebuilt only where something changed, so a page with no
 * links to the renamed page is returned untouched and is not written back.
 */
export function retargetLinks(blocks: BaseBlock[], map: LinkMapper): { blocks: BaseBlock[]; changed: number } {
  let changed = 0;

  function walk(list: BaseBlock[]): BaseBlock[] {
    return list.map((block) => {
      let props = block.props;
      for (const key of LINK_PROPS[block.type] ?? []) {
        const next = remap(props?.[key], map);
        if (next !== null) {
          props = { ...props, [key]: next };
          changed += 1;
        }
      }
      for (const [listKey, field] of NESTED_LINK_PROPS[block.type] ?? []) {
        const list = props?.[listKey];
        if (!Array.isArray(list)) continue;
        let moved = false;
        const nextList = list.map((entry) => {
          if (!entry || typeof entry !== "object") return entry;
          const next = remap((entry as Record<string, unknown>)[field] as string, map);
          if (next === null) return entry;
          moved = true;
          changed += 1;
          return { ...entry, [field]: next };
        });
        if (moved) props = { ...props, [listKey]: nextList };
      }
      if (block.type === "html" && typeof props?.html === "string") {
        const next = retargetHtmlLinks(props.html, map);
        if (next !== props.html) {
          props = { ...props, html: next };
          changed += 1;
        }
      }
      // A link the formatting toolbar put in a paragraph, an FAQ answer or a
      // table cell. See `mapRichText` for every place that can be.
      if (props && typeof props === "object") {
        props = mapRichText(block.type, props, (html) => {
          if (!html.includes("href")) return html;
          const next = retargetHtmlLinks(html, map);
          if (next !== html) changed += 1;
          return next;
        });
      }
      const children = block.children ? walk(block.children) : undefined;
      if (props === block.props && children === block.children) return block;
      return children ? { ...block, props, children } : { ...block, props };
    });
  }

  const next = walk(blocks);
  return { blocks: changed ? next : blocks, changed };
}

/**
 * The same, over one page's stored JSON. Content that will not parse is left
 * exactly as it is — a rename is no moment to rewrite something we cannot read.
 */
export function retargetLinksInContent(content: string, map: LinkMapper): { content: string; changed: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content || "[]");
  } catch {
    return { content, changed: 0 };
  }
  if (!Array.isArray(parsed)) return { content, changed: 0 };
  const { blocks, changed } = retargetLinks(parsed as BaseBlock[], map);
  return { content: changed ? JSON.stringify(blocks) : content, changed };
}

/** One page of a site, as somewhere a link can point. */
export interface LinkTarget {
  slug: string;
  title: string;
  isHome: boolean;
  published: boolean;
}

/**
 * The page of this site that `href` points at, or null for an address that
 * goes elsewhere. Used to show which page a link lands on, and to notice one
 * that lands nowhere: a path under this site that matches no page is a link
 * that will 404, and it is worth saying so while it can still be fixed.
 */
export function targetOf(href: string, siteSlug: string, pages: LinkTarget[]): LinkTarget | null {
  const path = trimSlashes(barePath(href || ""));
  for (const page of pages) {
    if (trimSlashes(pagePath(siteSlug, page.slug, page.isHome)) === path) return page;
    // The home page answers to its slug as well as to the bare site address.
    if (page.isHome && trimSlashes(pagePath(siteSlug, page.slug, false)) === path) return page;
  }
  return null;
}

/** True when `href` addresses somewhere inside this site. */
export function isInternalLink(href: string, siteSlug: string): boolean {
  const path = barePath(href || "");
  return path === `/sites/${siteSlug}` || path.startsWith(`/sites/${siteSlug}/`);
}

/**
 * The stand-in a template writes where a site address belongs.
 *
 * A template is static data and cannot know the slug of a site nobody has
 * created yet, so a link from one of its pages to another is written as
 * `{{site}}/contact` and resolved when the site is made. Without it a
 * template's pages could only link to `#`, which is why 27 of them had
 * nothing to link to in the first place.
 */
export const SITE_TOKEN = "{{site}}";

/** A link from one page of a template to another. An empty slug is the home page. */
export function templateLink(pageSlug: string): string {
  return pageSlug ? `${SITE_TOKEN}/${pageSlug}` : SITE_TOKEN;
}

/** Every `{{site}}` in a template's serialised blocks, resolved to a real site. */
export function resolveSiteToken(json: string, siteSlug: string): string {
  return json.split(SITE_TOKEN).join(`/sites/${siteSlug}`);
}
