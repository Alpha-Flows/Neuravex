import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { normalizeLogo, LOGO_HEIGHT } from "@/lib/site-logo";
import { editableMenu, menuForArchive, normalizeMenu, resolveMenu, retargetMenu, type MenuPage } from "@/lib/menu";
import { footerCopyright, mailHref, normalizeFooter, retargetFooter, telHref } from "@/lib/footer";
import { normalizeSiteFields } from "@/lib/site-fields";

const pages: MenuPage[] = [
  { id: "p-home", slug: "home", title: "Home", isHome: true },
  { id: "p-about", slug: "about", title: "About us and our story", isHome: false },
  { id: "p-team", slug: "team", title: "Team", isHome: false },
  { id: "p-thanks", slug: "thanks", title: "Thank you", isHome: false },
];
const site = { slug: "acme" };

describe("the header's logo", () => {
  it("keeps a picture, a height inside the header and whether the name is written beside it", () => {
    expect(normalizeLogo({ src: "/uploads/logo.png", height: 500, withName: true })).toEqual({ src: "/uploads/logo.png", height: LOGO_HEIGHT.max, withName: true });
    expect(normalizeLogo('{"src":"https://cdn.example.com/l.svg"}')).toEqual({ src: "https://cdn.example.com/l.svg", height: 32, withName: false });
  });

  it("is nothing without an address a picture can be at", () => {
    for (const src of ["javascript:alert(1)", "mailto:a@b.c", "#top", "//evil.example/x.png", "", 5]) {
      expect(normalizeLogo({ src }), String(src)).toBeNull();
    }
    expect(normalizeLogo("nonsense")).toBeNull();
    expect(normalizeSiteFields({ logo: { src: "data:x" } })).toEqual({ logo: null });
  });
});

describe("the header's menu, as stored", () => {
  it("keeps pages by id and links with a label and a safe address, one level deep", () => {
    const menu = normalizeMenu([
      { kind: "page", page: "p-about", label: "  About  ", hidden: false },
      {
        kind: "link",
        label: "Services",
        href: "",
        children: [
          { kind: "page", page: "p-team" },
          { kind: "link", label: "Deep", href: "/x", children: [{ kind: "page", page: "p-home" }] },
        ],
      },
      { kind: "link", label: "Evil", href: "javascript:alert(1)" },
      { kind: "link", label: "", href: "https://x.example" },
      { kind: "link", label: "Empty heading", href: "" },
      { kind: "other" },
    ]);
    expect(menu).toEqual([
      { kind: "page", page: "p-about", label: "About" },
      { kind: "link", label: "Services", href: "", children: [{ kind: "page", page: "p-team" }, { kind: "link", label: "Deep", href: "/x" }] },
    ]);
  });

  it("holds forty entries at most, counting those in dropdowns", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: "link", label: `L${i}`, href: "/x", children: [{ kind: "link", label: "c", href: "/y" }] }));
    const count = normalizeMenu(many).reduce((n, e) => n + 1 + (e.children?.length ?? 0), 0);
    expect(count).toBeLessThanOrEqual(40);
  });
});

describe("the header's menu, as drawn", () => {
  it("is every page in order when nothing has been arranged", () => {
    expect(resolveMenu(null, pages, site, "about").map((i) => [i.label, i.href, i.active])).toEqual([
      ["Home", "/sites/acme", false],
      ["About us and our story", "/sites/acme/about", true],
      ["Team", "/sites/acme/team", false],
      ["Thank you", "/sites/acme/thanks", false],
    ]);
  });

  it("follows the arrangement: labels, a page left out, a link, and a dropdown", () => {
    const menu = [
      { kind: "page", page: "p-home" },
      { kind: "page", page: "p-about", label: "About", children: [{ kind: "page", page: "p-team" }] },
      { kind: "page", page: "p-thanks", hidden: true },
      { kind: "link", label: "Shop", href: "https://shop.example.com" },
      { kind: "link", label: "Prices", href: "#prices" },
    ];
    const drawn = resolveMenu(menu, pages, site, "team");
    expect(drawn.map((i) => i.label)).toEqual(["Home", "About", "Shop", "Prices"]);
    const about = drawn[1];
    expect(about.children).toEqual([{ label: "Team", href: "/sites/acme/team", active: true, children: [] }]);
    // A parent is active when the page being shown is in its dropdown.
    expect(about.active).toBe(true);
    // A typed fragment is put where the page's named sections are.
    expect(drawn[3].href).toBe("#c-prices");
  });

  it("adds a page made after the menu was arranged, and drops one that is gone or unpublished", () => {
    const drawn = resolveMenu([{ kind: "page", page: "p-deleted" }, { kind: "page", page: "p-about" }], pages.slice(0, 3), site, "");
    expect(drawn.map((i) => i.label)).toEqual(["About us and our story", "Home", "Team"]);
  });

  it("brings a hidden page's dropdown up into its place, and drops a heading left with nothing under it", () => {
    const drawn = resolveMenu(
      [
        { kind: "page", page: "p-about", hidden: true, children: [{ kind: "page", page: "p-team" }] },
        { kind: "link", label: "More", href: "", children: [{ kind: "page", page: "p-thanks", hidden: true }] },
      ],
      pages,
      site,
      "",
    );
    expect(drawn.map((i) => i.label)).toEqual(["Team", "Home"]);
  });

  it("reads a page named by slug, as an imported site's menu names them", () => {
    expect(resolveMenu([{ kind: "page", page: "team", label: "Crew" }], pages, site, "")[0].label).toBe("Crew");
    expect(menuForArchive([{ kind: "page", page: "p-team" }], pages)).toEqual([{ kind: "page", page: "team" }]);
  });

  it("is edited with every page in it, and the arranged ids resolved", () => {
    expect(editableMenu([{ kind: "page", page: "team" }], pages)).toEqual([
      { kind: "page", page: "p-team", children: undefined },
      { kind: "page", page: "p-home" },
      { kind: "page", page: "p-about" },
      { kind: "page", page: "p-thanks" },
    ]);
  });

  it("follows a rename in its links, and needs nothing for its pages", () => {
    const moved = retargetMenu([{ kind: "link", label: "Us", href: "/sites/acme/about#c-team" }, { kind: "page", page: "p-about" }], (href) =>
      href.replace("/sites/acme/about", "/sites/acme/about-us"),
    );
    expect(moved).toEqual([{ kind: "link", label: "Us", href: "/sites/acme/about-us#c-team" }, { kind: "page", page: "p-about" }]);
  });

  it("draws its dropdowns with CSS alone, opened by hovering or by the keyboard", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".nvx-menu-group:hover > .nvx-menu-drop");
    expect(css).toContain(".nvx-menu-group:focus-within > .nvx-menu-drop");
  });
});

describe("the laid-out footer", () => {
  it("keeps what draws something, repaired, and is nothing when nothing does", () => {
    const footer = normalizeFooter({
      about: "  Bread since 1990. ",
      columns: [
        { title: "Company", links: [{ label: "About", href: "/sites/acme/about" }, { label: "Bad", href: "javascript:1" }, { label: "", href: "/x" }] },
        { title: "", links: [] },
      ],
      contact: { address: "Hauptstr. 1\r\n10115 Berlin", phone: "+49 30 123", email: "hi@acme.example" },
      social: [{ network: "instagram", href: "@acme" }, { network: "nonsense", href: "" }],
      copyright: "",
      background: "red;background:url(//x)",
    });
    expect(footer).toEqual({
      about: "Bread since 1990.",
      columns: [{ title: "Company", links: [{ label: "About", href: "/sites/acme/about" }] }],
      contact: { address: "Hauptstr. 1\n10115 Berlin", phone: "+49 30 123", email: "hi@acme.example" },
      social: [{ network: "instagram", href: "https://www.instagram.com/acme" }],
      copyright: "",
      background: "",
    });
    expect(normalizeFooter({ columns: [], background: "#000000" })).toBeNull();
    expect(normalizeSiteFields({ footer: {} })).toEqual({ footer: null });
  });

  it("fills in its copyright line, and turns contact details into links only where they are real", () => {
    expect(footerCopyright({ copyright: "" }, { name: "Acme" }, 2030)).toBe("© 2030 Acme");
    expect(footerCopyright({ copyright: "{name}, since 1990 — {year}" }, { name: "Acme" }, 2030)).toBe("Acme, since 1990 — 2030");
    expect(telHref("+49 (30) 123-45")).toBe("tel:+493012345");
    expect(telHref("call us")).toBeNull();
    expect(mailHref("hi@acme.example")).toBe("mailto:hi@acme.example");
    expect(mailHref("hi at acme")).toBeNull();
  });

  it("follows a rename in its links", () => {
    const moved = retargetFooter({ columns: [{ title: "Us", links: [{ label: "About", href: "/sites/acme/about" }] }] }, (h) => h.replace("acme", "bake"));
    expect(moved?.columns[0].links[0].href).toBe("/sites/bake/about");
  });

  it("gives way to custom footer HTML, which has always won", () => {
    const chrome = readFileSync("src/components/public/SiteChrome.tsx", "utf8");
    expect(chrome).toContain("const design = site.footerHtml ? null : normalizeFooter(site.footer);");
  });
});
