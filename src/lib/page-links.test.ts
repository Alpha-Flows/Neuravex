import { describe, it, expect } from "vitest";
import {
  isInternalLink,
  moveSite,
  movePath,
  pagePath,
  resolveSiteToken,
  retargetHtmlLinks,
  retargetLinks,
  retargetLinksInContent,
  targetOf,
  templateLink,
} from "./page-links";
import { BaseBlock } from "@/types";

const button = (id: string, href: string): BaseBlock => ({ id, type: "button", props: { label: id, href } });

describe("pagePath", () => {
  it("gives the home page the bare site address", () => {
    expect(pagePath("acme", "index", true)).toBe("/sites/acme");
    expect(pagePath("acme", "about", false)).toBe("/sites/acme/about");
  });
});

describe("renaming a page", () => {
  const map = movePath("/sites/acme/pricing", "/sites/acme/plans");

  it("moves the links that pointed at it", () => {
    const { blocks, changed } = retargetLinks([button("a", "/sites/acme/pricing")], map);
    expect(changed).toBe(1);
    expect(blocks[0].props.href).toBe("/sites/acme/plans");
  });

  it("keeps a fragment and a query string", () => {
    const { blocks } = retargetLinks(
      [button("a", "/sites/acme/pricing#faq"), button("b", "/sites/acme/pricing?ref=nav")],
      map,
    );
    expect(blocks[0].props.href).toBe("/sites/acme/plans#faq");
    expect(blocks[1].props.href).toBe("/sites/acme/plans?ref=nav");
  });

  it("does not touch a link that only looks similar", () => {
    const { blocks, changed } = retargetLinks(
      [
        button("a", "https://example.com/sites/acme/pricing"),
        button("b", "/sites/acme/pricing-plans"),
        button("c", "/sites/other/pricing"),
      ],
      map,
    );
    expect(changed).toBe(0);
    expect(blocks[0].props.href).toBe("https://example.com/sites/acme/pricing");
    expect(blocks[1].props.href).toBe("/sites/acme/pricing-plans");
    expect(blocks[2].props.href).toBe("/sites/other/pricing");
  });

  it("reaches links nested inside sections and columns", () => {
    const tree: BaseBlock[] = [
      {
        id: "s",
        type: "section",
        props: {},
        children: [{ id: "c", type: "columns", props: {}, children: [button("a", "/sites/acme/pricing")] }],
      },
    ];
    const { blocks, changed } = retargetLinks(tree, map);
    expect(changed).toBe(1);
    expect(blocks[0].children![0].children![0].props.href).toBe("/sites/acme/plans");
  });

  it("reaches a link written into a custom HTML block", () => {
    const html: BaseBlock = { id: "h", type: "html", props: { html: '<a href="/sites/acme/pricing">Plans</a>' } };
    const { blocks, changed } = retargetLinks([html], map);
    expect(changed).toBe(1);
    expect(blocks[0].props.html).toContain('href="/sites/acme/plans"');
  });

  it("returns the very same tree when nothing pointed at it", () => {
    const tree = [button("a", "https://example.com")];
    const { blocks, changed } = retargetLinks(tree, map);
    expect(changed).toBe(0);
    expect(blocks).toBe(tree);
  });

  it("leaves content it cannot parse exactly as it is", () => {
    const broken = "{not json";
    expect(retargetLinksInContent(broken, map)).toEqual({ content: broken, changed: 0 });
  });
});

describe("renaming a site", () => {
  const map = moveSite("acme", "acme-co");

  it("moves every address under the old site", () => {
    const { blocks, changed } = retargetLinks(
      [button("a", "/sites/acme"), button("b", "/sites/acme/about"), button("c", "/sites/acme/a/b#x")],
      map,
    );
    expect(changed).toBe(3);
    expect(blocks.map((b) => b.props.href)).toEqual(["/sites/acme-co", "/sites/acme-co/about", "/sites/acme-co/a/b#x"]);
  });

  it("does not move a site whose slug merely starts the same", () => {
    const { changed } = retargetLinks([button("a", "/sites/acme-two/about")], map);
    expect(changed).toBe(0);
  });

  it("moves links in custom header and footer HTML", () => {
    expect(retargetHtmlLinks(`<a href='/sites/acme/about'>About</a>`, map)).toBe(
      `<a href='/sites/acme-co/about'>About</a>`,
    );
  });
});

describe("what a link points at", () => {
  const pages = [
    { slug: "index", title: "Home", isHome: true, published: true },
    { slug: "about", title: "About", isHome: false, published: true },
    { slug: "contact", title: "Contact", isHome: false, published: false },
  ];

  it("finds the page behind an address", () => {
    expect(targetOf("/sites/acme/about", "acme", pages)?.title).toBe("About");
    expect(targetOf("/sites/acme", "acme", pages)?.title).toBe("Home");
    // The home page answers to its own slug as well as to the bare address.
    expect(targetOf("/sites/acme/index", "acme", pages)?.title).toBe("Home");
    expect(targetOf("/sites/acme/about#team", "acme", pages)?.title).toBe("About");
  });

  it("says nothing for an address that is not a page of this site", () => {
    expect(targetOf("/sites/acme/nowhere", "acme", pages)).toBeNull();
    expect(targetOf("https://example.com", "acme", pages)).toBeNull();
  });

  it("knows an address inside this site from one outside it", () => {
    expect(isInternalLink("/sites/acme/about", "acme")).toBe(true);
    expect(isInternalLink("/sites/acme", "acme")).toBe(true);
    expect(isInternalLink("/sites/acme-two/about", "acme")).toBe(false);
    expect(isInternalLink("https://example.com", "acme")).toBe(false);
    expect(isInternalLink("", "acme")).toBe(false);
  });
});

describe("a template's stand-in for a site address", () => {
  it("becomes the real site when one is created", () => {
    const json = JSON.stringify([{ href: templateLink("contact") }, { href: templateLink("") }]);
    expect(JSON.parse(resolveSiteToken(json, "acme-co"))).toEqual([
      { href: "/sites/acme-co/contact" },
      { href: "/sites/acme-co" },
    ]);
  });
});
