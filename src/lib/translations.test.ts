import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  cleanLanguage,
  hreflangLinks,
  languageSwitch,
  menuForLanguage,
  nativeLanguageName,
  pageLanguage,
  siteLanguages,
  translationsOf,
  type LangPage,
} from "@/lib/translations";
import { resolveMenu } from "@/lib/menu";
import { normalizeArchivePages } from "@/lib/site-archive";

const page = (over: Partial<LangPage> & { id: string }): LangPage => ({
  slug: over.id,
  title: over.id,
  isHome: false,
  language: null,
  translationGroup: null,
  ...over,
});

// An English site with a German home page, a German About, and a Blog in English only.
const home = page({ id: "home", slug: "index", title: "Home", isHome: true, translationGroup: "g1" });
const start = page({ id: "start", slug: "de", title: "Start", language: "de", translationGroup: "g1" });
const about = page({ id: "about", title: "About", translationGroup: "g2" });
const ueber = page({ id: "ueber", slug: "ueber-uns", title: "Über uns", language: "de", translationGroup: "g2" });
const blog = page({ id: "blog", title: "Blog" });
const pages = [home, start, about, ueber, blog];

describe("a page's language", () => {
  it("is its own, or the site's when it names none, and only ever a language code", () => {
    expect(pageLanguage(about, "en")).toBe("en");
    expect(pageLanguage(ueber, "en")).toBe("de");
    expect(cleanLanguage(" pt-BR ")).toBe("pt-BR");
    expect(cleanLanguage('de" onload="x')).toBeNull();
    expect(cleanLanguage("")).toBeNull();
    expect(siteLanguages(pages, "en")).toEqual(["en", "de"]);
  });

  it("is named in itself for the switcher", () => {
    expect(nativeLanguageName("de")).toBe("Deutsch");
    expect(nativeLanguageName("fr")).toBe("Français");
    expect(nativeLanguageName("xx-nothing")).toBe("XX-NOTHING");
  });
});

describe("translations", () => {
  it("are the pages sharing a group, one per language, the site's language first", () => {
    expect(translationsOf(ueber, pages, "en").map((p) => p.id)).toEqual(["about", "ueber"]);
    expect(translationsOf(blog, pages, "en").map((p) => p.id)).toEqual(["blog"]);
    // A second German page in the group does not take the first one's place.
    const extra = page({ id: "extra", language: "de", translationGroup: "g2" });
    expect(translationsOf(about, [...pages, extra], "en").map((p) => p.id)).toEqual(["about", "ueber"]);
  });

  it("give each page a switcher to itself in every language, or to that language's home", () => {
    expect(languageSwitch(about, pages, "en", "acme")).toEqual([
      { language: "en", label: "English", href: "/sites/acme/about", current: true },
      { language: "de", label: "Deutsch", href: "/sites/acme/ueber-uns", current: false },
    ]);
    // The blog has no German version, so German readers are sent to the German home page.
    expect(languageSwitch(blog, pages, "en", "acme").map((l) => l.href)).toEqual(["/sites/acme/blog", "/sites/acme/de"]);
    // A site in one language has nothing to switch.
    expect(languageSwitch(blog, [home, blog], "en", "acme")).toEqual([]);
  });

  it("are named to search engines, each version naming every version", () => {
    const urls = hreflangLinks(ueber, pages, "en", (p) => `/sites/acme/${p.slug}`);
    expect(urls).toEqual({ en: "/sites/acme/about", de: "/sites/acme/ueber-uns", "x-default": "/sites/acme/about" });
    expect(hreflangLinks(blog, pages, "en", (p) => p.slug)).toEqual({});
  });
});

describe("the menu in another language", () => {
  const menu = [
    { kind: "page", page: "home", label: "Welcome" },
    { kind: "page", page: "about", label: "About us" },
    { kind: "page", page: "blog" },
  ];

  it("swaps each page for its translation, without the label written for the original", () => {
    const local = menuForLanguage(menu, pages, "de", "en");
    const items = resolveMenu(local.menu, local.pages, { slug: "acme" }, "ueber-uns");
    expect(items.map((i) => [i.label, i.href, i.active])).toEqual([
      ["Start", "/sites/acme/de", false],
      ["Über uns", "/sites/acme/ueber-uns", true],
    ]);
  });

  it("keeps the original's labels and pages in the site's own language", () => {
    const local = menuForLanguage(menu, pages, "en", "en");
    const items = resolveMenu(local.menu, local.pages, { slug: "acme" }, "about");
    expect(items.map((i) => i.label)).toEqual(["Welcome", "About us", "Blog"]);
  });

  it("shows a page named twice once", () => {
    const both = [...menu, { kind: "page", page: "ueber" }];
    const local = menuForLanguage(both, pages, "de", "en");
    const items = resolveMenu(local.menu, local.pages, { slug: "acme" }, "de");
    expect(items.filter((i) => i.label === "Über uns")).toHaveLength(1);
  });
});

describe("a translation", () => {
  it("keeps its language and its group through an archive, repaired", () => {
    const [a, b] = normalizeArchivePages([
      { title: "A", slug: "a", content: "[]", language: "de", translationGroup: "clx1" },
      { title: "B", slug: "b", content: "[]", language: "<b>", translationGroup: "a b" },
    ]);
    expect(a).toMatchObject({ language: "de", translationGroup: "clx1" });
    expect(b).toMatchObject({ language: null, translationGroup: null });
  });

  it("puts its language on the document, and its versions in the head", () => {
    const layout = readFileSync("src/app/(published)/sites/[siteSlug]/layout.tsx", "utf8");
    expect(layout).toContain("<html lang={language");
    const route = readFileSync("src/app/(published)/sites/[siteSlug]/[[...pageSlug]]/page.tsx", "utf8");
    expect(route).toContain("hreflangLinks(page, pages, site.language");
  });
});
