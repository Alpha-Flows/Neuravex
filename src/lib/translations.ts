/**
 * A site in more than one language.
 *
 * A site had one language, on `<html lang>`, and a German and an English
 * version of the same page were two unrelated pages: both in one menu, side
 * by side, with nothing to take a reader from one to the other and nothing to
 * tell a search engine that one was the translation of the other — which it
 * then counted as duplicate content, and showed a German reader the English
 * page.
 *
 * So a page carries a language (none meaning the site's own), and pages that
 * are translations of one another share a group. From those two facts come
 * the rest: each page's `lang`, the menu a reader in that language sees, the
 * switcher in the header that goes to the same page in another language, and
 * the `hreflang` links that say so to a search engine.
 *
 * No dependencies: the header, the editor and the server all read this.
 */
import { normalizeMenu, type MenuEntry } from "./menu";

/**
 * A language code as `<html lang>` takes one: `de`, `en-GB`, `pt-BR`. The
 * same rule the site's own language is held to, so nothing else can reach an
 * attribute through here.
 */
const LANGUAGE_CODE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/;

/** A group key: the id of a page, which is all one ever is. */
const GROUP_KEY = /^[a-zA-Z0-9_-]{1,40}$/;

/** A language code, tidied, or null when it is not one. */
export function cleanLanguage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim();
  return code.length <= 35 && LANGUAGE_CODE.test(code) ? code : null;
}

/** A translation group key, or null when it is not one. */
export function cleanGroup(raw: unknown): string | null {
  return typeof raw === "string" && GROUP_KEY.test(raw) ? raw : null;
}

/** Two language codes as the same language: `DE` is `de`. */
export function sameLanguage(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The languages the builder offers by name, in English, since that is the
 * language the builder is written in. Any other code can still be typed.
 */
export const COMMON_LANGUAGES: readonly { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "pt", name: "Portuguese" },
  { code: "pl", name: "Polish" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "sv", name: "Swedish" },
  { code: "nb", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "el", name: "Greek" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "he", name: "Hebrew" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
];

/** A language's name in English, for the builder: "German", or the code itself. */
export function builderLanguageName(code: string): string {
  const base = code.split("-")[0].toLowerCase();
  const known = COMMON_LANGUAGES.find((l) => l.code === base)?.name;
  if (!known) return code;
  return base === code.toLowerCase() ? known : `${known} (${code})`;
}

/**
 * A language's name in that language — "Deutsch", "Français" — which is how
 * a switcher names it: a reader looking for their own language looks for its
 * own name. Worked out on the server, where it is drawn once, so the page a
 * browser hydrates cannot disagree with the one it was sent.
 */
export function nativeLanguageName(code: string): string {
  try {
    // `fallback: "none"`, or a code the runtime has no name for comes back
    // dressed up as one — "xx (NOTHING)".
    const name = new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    // Not a code the runtime knows a name for.
  }
  return code.toUpperCase();
}

export interface LangPage {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  language?: string | null;
  translationGroup?: string | null;
}

/** The language a page is in: its own, or the site's when it names none. */
export function pageLanguage(page: { language?: string | null }, siteLanguage: string): string {
  return cleanLanguage(page.language) ?? siteLanguage;
}

/**
 * The pages that are this page in some language, itself included: one per
 * language, the first met wins, the site's language first.
 */
export function translationsOf<T extends LangPage>(page: T, pages: T[], siteLanguage: string): T[] {
  const group = cleanGroup(page.translationGroup);
  const members = group ? pages.filter((p) => p.id === page.id || p.translationGroup === group) : [page];
  if (!members.some((p) => p.id === page.id)) members.unshift(page);
  const byLanguage = new Map<string, T>();
  // The page itself first, so it is the one kept for its own language.
  for (const p of [page, ...members.filter((m) => m.id !== page.id)]) {
    const lang = pageLanguage(p, siteLanguage).toLowerCase();
    if (!byLanguage.has(lang)) byLanguage.set(lang, p);
  }
  return [...byLanguage.values()].sort((a, b) => languageOrder(a, b, siteLanguage));
}

function languageOrder(a: LangPage, b: LangPage, siteLanguage: string): number {
  const la = pageLanguage(a, siteLanguage);
  const lb = pageLanguage(b, siteLanguage);
  if (sameLanguage(la, lb)) return 0;
  if (sameLanguage(la, siteLanguage)) return -1;
  if (sameLanguage(lb, siteLanguage)) return 1;
  return la.localeCompare(lb);
}

/** This page's translation into `language`, or undefined. */
export function translationIn<T extends LangPage>(page: T, language: string, pages: T[], siteLanguage: string): T | undefined {
  return translationsOf(page, pages, siteLanguage).find((p) => sameLanguage(pageLanguage(p, siteLanguage), language));
}

/** Every language the pages are written in, the site's first. */
export function siteLanguages(pages: LangPage[], siteLanguage: string): string[] {
  const out: string[] = [siteLanguage];
  for (const p of pages) {
    const lang = pageLanguage(p, siteLanguage);
    if (!out.some((l) => sameLanguage(l, lang))) out.push(lang);
  }
  return out;
}

/** Where a page of the site lives. The home page is the bare site address. */
function hrefOf(siteSlug: string, page: LangPage): string {
  return page.isHome ? `/sites/${siteSlug}` : `/sites/${siteSlug}/${page.slug}`;
}

/**
 * The home page for readers of one language: the translation of the home
 * page into it, or else the first page written in it. Undefined when the
 * language has no page at all.
 */
export function homeFor<T extends LangPage>(language: string, pages: T[], siteLanguage: string): T | undefined {
  const home = pages.find((p) => p.isHome);
  const translated = home ? translationIn(home, language, pages, siteLanguage) : undefined;
  return translated ?? pages.find((p) => sameLanguage(pageLanguage(p, siteLanguage), language));
}

export interface LanguageLink {
  /** The code, as the `hreflang` and `lang` of the link. */
  language: string;
  /** The language's own name for itself. */
  label: string;
  href: string;
  /** The language of the page this is drawn on. */
  current: boolean;
}

/**
 * The header's switcher for one page: each language the site is written in,
 * linking to this page in that language, or — when this page has no
 * translation into it — to that language's home page, which is better than a
 * reader finding no way into their language from here. Empty for a site in
 * one language, which has nothing to switch.
 *
 * `pages` are the pages a reader can reach: published, and none of the legal
 * pages or the "not found" page, whose language is not a choice.
 */
export function languageSwitch<T extends LangPage>(page: T, pages: T[], siteLanguage: string, siteSlug: string): LanguageLink[] {
  const all = pages.some((p) => p.id === page.id) ? pages : [...pages, page];
  const languages = siteLanguages(all, siteLanguage);
  if (languages.length < 2) return [];
  const current = pageLanguage(page, siteLanguage);
  const links: LanguageLink[] = [];
  for (const language of languages) {
    const target = sameLanguage(language, current)
      ? page
      : translationIn(page, language, all, siteLanguage) ?? homeFor(language, all, siteLanguage);
    if (!target) continue;
    links.push({ language, label: nativeLanguageName(language), href: hrefOf(siteSlug, target), current: sameLanguage(language, current) });
  }
  return links;
}

/**
 * The menu as a reader of one language sees it, and the pages it may show.
 *
 * The menu is arranged once, from the site's own language. On a page in
 * another language each page it names is swapped for that page's translation,
 * without the label written for the original — "About" is not what the
 * German menu should call "Über uns" — and the pages offered are that
 * language's alone, so a translation made later still appears at the end of
 * its own language's menu and in nobody else's. A page named twice once
 * translated — the English page and its German translation both in the
 * arrangement — is shown once, where it comes first.
 */
export function menuForLanguage<T extends LangPage>(
  raw: unknown,
  pages: T[],
  language: string,
  siteLanguage: string,
): { menu: MenuEntry[]; pages: T[] } {
  const own = pages.filter((p) => sameLanguage(pageLanguage(p, siteLanguage), language));
  if (siteLanguages(pages, siteLanguage).length < 2) return { menu: normalizeMenu(raw), pages: own };
  const seen = new Set<string>();
  const find = (ref: string | undefined) => (ref ? pages.find((p) => p.id === ref) ?? pages.find((p) => p.slug === ref) : undefined);
  const walk = (e: MenuEntry): MenuEntry => {
    const children = e.children?.map(walk);
    if (e.kind !== "page") return { ...e, ...(children ? { children } : {}) };
    const named = find(e.page);
    if (!named) return { ...e, ...(children ? { children } : {}) };
    const inLanguage = sameLanguage(pageLanguage(named, siteLanguage), language)
      ? named
      : translationIn(named, language, pages, siteLanguage);
    if (!inLanguage) return { ...e, ...(children ? { children } : {}) };
    const translated = inLanguage.id !== named.id;
    const out: MenuEntry = { kind: "page", page: inLanguage.id };
    if (e.label && !translated) out.label = e.label;
    if (e.hidden || seen.has(inLanguage.id)) out.hidden = true;
    if (children) out.children = children;
    seen.add(inLanguage.id);
    return out;
  };
  return { menu: normalizeMenu(raw).map(walk), pages: own };
}

/**
 * The address of every published translation of a page, by language, for
 * `hreflang`: each version of a page names every version, itself included,
 * and `x-default` is the one in the site's own language. Empty for a page
 * with no published translation — a lone page has nothing to point at.
 */
export function hreflangLinks<T extends LangPage>(
  page: T,
  pages: T[],
  siteLanguage: string,
  urlOf: (page: T) => string,
): Record<string, string> {
  const versions = translationsOf(page, pages, siteLanguage);
  if (versions.length < 2) return {};
  const out: Record<string, string> = {};
  for (const version of versions) out[pageLanguage(version, siteLanguage)] = urlOf(version);
  const primary = versions.find((v) => sameLanguage(pageLanguage(v, siteLanguage), siteLanguage));
  if (primary) out["x-default"] = urlOf(primary);
  return out;
}
