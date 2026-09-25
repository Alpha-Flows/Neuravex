import { describe, it, expect } from "vitest";
import type { BaseBlock } from "@/types";
import { checkPage, checkSite, HEAVY_BYTES, type CheckPage, type CheckSite, type ImageFacts } from "@/lib/prepublish";

const site = (over: Partial<CheckSite> = {}): CheckSite => ({
  slug: "acme",
  description: "A bakery.",
  metaDescription: null,
  menu: null,
  footer: null,
  formerSlugs: new Map(),
  ...over,
});

const page = (id: string, blocks: BaseBlock[], over: Partial<CheckPage> = {}): CheckPage => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  slug: id,
  isHome: false,
  published: true,
  isPost: false,
  isNotFound: false,
  legalKind: null,
  metaDescription: null,
  blocks,
  ...over,
});

const heading = (id: string, level: number, text = "Title"): BaseBlock => ({ id, type: "heading", props: { text, level } });
const button = (id: string, href: string, label = "Book now"): BaseBlock => ({ id, type: "button", props: { label, href } });
const kinds = (list: { kind: string; blockId?: string }[]) => list.map((f) => `${f.kind}:${f.blockId ?? "-"}`);

describe("the check before publishing", () => {
  it("finds a picture nobody described, alone or in a gallery", () => {
    const found = checkPage(
      page("home", [
        heading("h", 1),
        { id: "i", type: "image", props: { src: "/uploads/a.webp", alt: "" } },
        { id: "ok", type: "image", props: { src: "/uploads/b.webp", alt: "Our shop" } },
        { id: "g", type: "gallery", props: { images: [{ src: "/uploads/c.webp", alt: "" }, { src: "/uploads/d.webp", alt: " " }, { src: "/uploads/e.webp", alt: "Bread" }] } },
      ]),
      site(),
      [],
      new Map(),
    );
    expect(kinds(found)).toEqual(["alt:i", "alt:g"]);
    expect(found[1].message).toContain("2 pictures in a gallery");
  });

  it("finds a button that goes nowhere, and a plan's", () => {
    const found = checkPage(
      page("home", [
        heading("h", 1),
        button("b", "#"),
        button("fine", "https://example.com"),
        { id: "p", type: "pricing", props: { plans: [{ name: "Pro", buttonLabel: "Choose", buttonHref: "#" }, { name: "Free", buttonLabel: "", buttonHref: "#" }] } },
      ]),
      site(),
      [],
      new Map(),
    );
    expect(kinds(found)).toEqual(["nowhere:b", "nowhere:p"]);
    expect(found[0].message).toBe("The button “Book now” goes nowhere: its link is “#”.");
  });

  it("finds a link to a draft, to no page at all, to a section that is not there, and one to an old address", () => {
    const contact = page("contact", [{ id: "s", type: "section", props: { anchor: "hours" }, children: [] }], { published: false });
    const about = page("about", [{ id: "s2", type: "section", props: { anchor: "team" }, children: [] }]);
    const home = page("home", [
      heading("h", 1),
      button("draft", "/sites/acme/contact"),
      button("gone", "/sites/acme/nowhere"),
      button("section", "/sites/acme/about#c-staff"),
      button("fine", "/sites/acme/about#c-team"),
      button("old", "/sites/acme/about-us"),
      { id: "t", type: "text", props: { text: 'See <a href="#c-missing">below</a>.' } },
    ]);
    const pages = [home, about, contact];
    const found = checkPage(home, site({ formerSlugs: new Map([["about-us", "about"]]) }), pages, new Map());
    expect(kinds(found)).toEqual(["link:draft", "link:gone", "section:section", "link:old", "section:t"]);
    expect(found.find((f) => f.blockId === "old")?.severity).toBe("suggestion");
    expect(found.find((f) => f.blockId === "draft")?.message).toContain("still a draft");
  });

  it("finds a heading that skips a level, and counts a post's title as its first", () => {
    const found = checkPage(page("home", [heading("a", 1), heading("b", 2), heading("c", 4), heading("d", 2)]), site(), [], new Map());
    expect(kinds(found)).toEqual(["heading:c"]);
    expect(kinds(checkPage(page("post", [heading("a", 2)], { isPost: true }), site(), [], new Map()))).toEqual([]);
    expect(kinds(checkPage(page("page", [heading("a", 3)]), site(), [], new Map()))).toEqual(["heading:a"]);
  });

  it("finds a picture heavier or wider than any page needs", () => {
    const images = new Map<string, ImageFacts>([
      ["/uploads/heavy.png", { bytes: HEAVY_BYTES + 1, width: 2000, name: "Shop front" }],
      ["/uploads/wide.webp", { bytes: 1000, width: 5000 }],
      ["/uploads/light.webp", { bytes: 1000, width: 1600 }],
    ]);
    const found = checkPage(
      page("home", [
        heading("h", 1),
        { id: "s", type: "section", props: { backgroundImage: "/uploads/heavy.png" }, children: [{ id: "i", type: "image", props: { src: "/uploads/wide.webp", alt: "x" } }] },
        { id: "l", type: "image", props: { src: "/uploads/light.webp", alt: "x" } },
      ]),
      site(),
      [],
      images,
    );
    expect(kinds(found)).toEqual(["heavy-image:s", "heavy-image:i"]);
    expect(found[0].message).toContain("“Shop front” is 1.5 MB");
  });

  it("finds a page with no search description, when the site has none either", () => {
    const bare = site({ description: null });
    expect(kinds(checkPage(page("home", [heading("h", 1)]), bare, [], new Map()))).toEqual(["description:-"]);
    expect(kinds(checkPage(page("home", [heading("h", 1)], { metaDescription: "Fresh bread." }), bare, [], new Map()))).toEqual([]);
    expect(kinds(checkPage(page("gone", [heading("h", 1)], { isNotFound: true }), bare, [], new Map()))).toEqual([]);
  });

  it("finds the menu's and the footer's links that go nowhere", () => {
    const pages = [page("home", [heading("h", 1)]), page("contact", [], { published: false })];
    const found = checkSite(
      site({
        menu: JSON.stringify([{ kind: "link", label: "Write to us", href: "/sites/acme/contact" }]),
        footer: JSON.stringify({ columns: [{ title: "More", links: [{ label: "Old", href: "/sites/acme/old" }] }] }),
      }),
      pages,
      new Map(),
    );
    const chrome = found.filter((f) => f.pageId === null).map((f) => f.message);
    expect(chrome).toHaveLength(2);
    expect(chrome[0]).toMatch(/^In the menu: .*still a draft/);
    expect(chrome[1]).toMatch(/^In the footer: .*not a page of this site/);
  });

  it("finds nothing on a page with nothing wrong", () => {
    const about = page("about", [heading("h", 1)]);
    const home = page("home", [heading("h", 1), heading("h2", 2), button("b", "/sites/acme/about"), { id: "i", type: "image", props: { src: "/uploads/a.webp", alt: "Bread" } }]);
    expect(checkPage(home, site(), [home, about], new Map())).toEqual([]);
  });
});
