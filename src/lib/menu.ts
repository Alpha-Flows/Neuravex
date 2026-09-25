/**
 * What the header's menu holds.
 *
 * The menu was every published page, in page order, under its title — and
 * nothing else. So a thank-you page a form sends people to was in the menu of
 * every page, a page called "Frequently asked questions" put four words into
 * a bar with room for one, a link to the shop the site sells through could
 * not be added at all, and a site with nine pages had nine items in one row.
 *
 * So the site keeps a menu of its own: an ordered list of pages and links,
 * each able to carry a shorter label, a page able to be left out, and one
 * level of items under any entry, which the header opens as a dropdown. A
 * page the list does not mention yet — one made after the menu was last
 * arranged — is added at the end, so a new page still shows up where people
 * expect it rather than nowhere.
 *
 * A page is named by its id, which a rename does not change. An archive
 * carries a slug in the same place instead, since ids are not kept across an
 * import, and `resolveMenu` accepts either.
 *
 * No dependencies beyond the URL rules: the settings panel, the header and
 * the MCP server all read this.
 */
import { isSafeHref } from "./url-safety";
import { fragmentLink } from "./anchors";

export interface MenuEntry {
  kind: "page" | "link";
  /** A page entry's page, by id — or, in an archive, by slug. */
  page?: string;
  /** A link entry's address. Empty for a heading that only opens its dropdown. */
  href?: string;
  /** Shown instead of the page's title; a link entry's only name. */
  label?: string;
  /** A page entry left out of the menu. */
  hidden?: boolean;
  /** One level of items under this one, shown as a dropdown. */
  children?: MenuEntry[];
}

/** One item as the header draws it. */
export interface MenuItem {
  label: string;
  /** Null for a heading that only opens its dropdown. */
  href: string | null;
  active: boolean;
  children: MenuItem[];
}

export interface MenuPage {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
}

export const MAX_MENU_ENTRIES = 40;
export const MAX_MENU_LABEL = 60;

function label(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_MENU_LABEL) : "";
}

function entry(raw: unknown, depth: number): MenuEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const children =
    depth === 0 && Array.isArray(v.children)
      ? (v.children.map((c) => entry(c, 1)).filter(Boolean) as MenuEntry[])
      : [];
  const name = label(v.label);

  if (v.kind === "page") {
    const page = typeof v.page === "string" ? v.page.trim().slice(0, 200) : "";
    if (!page) return null;
    const out: MenuEntry = { kind: "page", page };
    if (name) out.label = name;
    if (v.hidden === true) out.hidden = true;
    if (children.length) out.children = children;
    return out;
  }

  if (v.kind === "link") {
    // A link needs a name to be read out by; one with no address is a
    // heading, and only worth keeping when it has something under it.
    if (!name) return null;
    const typed = typeof v.href === "string" ? v.href.trim() : "";
    const href = typed ? isSafeHref(typed) : "";
    if (href === undefined || href.length > 2000) return null;
    if (!href && children.length === 0) return null;
    const out: MenuEntry = { kind: "link", label: name, href };
    if (children.length) out.children = children;
    return out;
  }

  return null;
}

/**
 * The menu, repaired: known kinds only, a safe address on every link, labels
 * of a sensible length, one level of children and no deeper, and no more than
 * forty entries in all. Accepts the stored JSON or the list.
 */
export function normalizeMenu(raw: unknown): MenuEntry[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: MenuEntry[] = [];
  let count = 0;
  for (const raw of value) {
    const e = entry(raw, 0);
    if (!e) continue;
    count += 1 + (e.children?.length ?? 0);
    if (count > MAX_MENU_ENTRIES) break;
    out.push(e);
  }
  return out;
}

/** The page an entry names, by id or — from an archive — by slug. */
function pageFor(ref: string | undefined, pages: MenuPage[]): MenuPage | undefined {
  if (!ref) return undefined;
  return pages.find((p) => p.id === ref) ?? pages.find((p) => p.slug === ref);
}

/**
 * The menu as the header draws it, for one page of the site.
 *
 * `pages` are the pages a menu may show — published, and not the legal pages
 * the footer carries. An entry for a page that is not among them (a draft, a
 * deleted page) is left out. A hidden page's own dropdown is still shown, in
 * its place, since hiding a page is not hiding everything filed under it.
 */
export function resolveMenu(
  raw: unknown,
  pages: MenuPage[],
  site: { slug: string },
  activeSlug: string,
): MenuItem[] {
  const menu = normalizeMenu(raw);
  const mentioned = new Set<string>();
  const hrefOf = (p: MenuPage) => (p.isHome ? `/sites/${site.slug}` : `/sites/${site.slug}/${p.slug}`);

  const item = (e: MenuEntry): MenuItem[] => {
    const children = (e.children ?? []).flatMap(item);
    if (e.kind === "page") {
      const page = pageFor(e.page, pages);
      if (page) mentioned.add(page.id);
      if (!page || e.hidden) return children;
      const active = page.slug === activeSlug;
      return [{ label: e.label || page.title, href: hrefOf(page), active: active || children.some((c) => c.active), children }];
    }
    // A heading with nothing left under it — every page in its dropdown
    // hidden or unpublished — would open onto nothing.
    if (!e.href && children.length === 0) return [];
    return [{ label: e.label ?? "", href: e.href ? fragmentLink(e.href) : null, active: children.some((c) => c.active), children }];
  };

  // A hidden page's dropdown comes up into its place, and a child that is
  // hidden or missing simply does not appear.
  const items = menu.flatMap(item);

  for (const page of pages) {
    if (mentioned.has(page.id)) continue;
    items.push({ label: page.title, href: hrefOf(page), active: page.slug === activeSlug, children: [] });
  }
  return items;
}

/**
 * The menu as the settings panel edits it: every page of the site in it,
 * the ones the stored menu does not mention yet added at the end, so what is
 * arranged is what visitors get.
 */
export function editableMenu(raw: unknown, pages: MenuPage[]): MenuEntry[] {
  const menu = normalizeMenu(raw);
  const seen = new Set<string>();
  const resolve = (e: MenuEntry): MenuEntry | null => {
    if (e.kind !== "page") return { ...e, children: e.children?.map(resolve).filter(Boolean) as MenuEntry[] | undefined };
    const page = pageFor(e.page, pages);
    if (!page || seen.has(page.id)) return null;
    seen.add(page.id);
    return { ...e, page: page.id, children: e.children?.map(resolve).filter(Boolean) as MenuEntry[] | undefined };
  };
  const out = menu.map(resolve).filter(Boolean) as MenuEntry[];
  for (const page of pages) if (!seen.has(page.id)) out.push({ kind: "page", page: page.id });
  return out;
}

/**
 * The menu with every link address passed through `map` — a rename moving
 * `/sites/acme/about` to `/sites/acme/about-us`, or the whole site to a new
 * address. Page entries are named by id and need nothing.
 */
export function retargetMenu(raw: unknown, map: (href: string) => string): MenuEntry[] {
  // Only link entries carry an address; see `relinkSite`.
  const walk = (e: MenuEntry): MenuEntry => ({
    ...e,
    ...(e.kind === "link" && e.href ? { href: map(e.href) } : {}),
    ...(e.children ? { children: e.children.map(walk) } : {}),
  });
  return normalizeMenu(raw).map(walk);
}

/** The menu with page ids turned into slugs, for an archive that outlives the ids. */
export function menuForArchive(raw: unknown, pages: { id: string; slug: string }[]): MenuEntry[] {
  const walk = (e: MenuEntry): MenuEntry => ({
    ...e,
    ...(e.kind === "page" ? { page: pages.find((p) => p.id === e.page)?.slug ?? e.page } : {}),
    ...(e.children ? { children: e.children.map(walk) } : {}),
  });
  return normalizeMenu(raw).map(walk);
}
