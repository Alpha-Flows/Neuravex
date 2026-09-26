import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { BaseBlock } from "@/types";
import {
  blocksInSynced,
  contactLinks,
  findInPage,
  findInSite,
  findInTree,
  findPattern,
  replaceInHtml,
  replaceInPage,
  replaceInSite,
  replaceInTree,
  snippetOf,
  type SiteWords,
} from "@/lib/find-replace";

/**
 * Find and replace across a site. The promise is that words change and
 * nothing else does: not a tag, not an attribute, not a link that happens to
 * contain the word — except the one kind of link that is the words, a phone
 * number's or an email address's.
 */

const p = (query: string, opts = {}) => findPattern(query, opts)!;

describe("what is searched for", () => {
  it("is the text as typed, not a pattern", () => {
    const pattern = p("£9.99 (inc. VAT)");
    expect(pattern.test("Only £9.99 (inc. VAT) today")).toBe(true);
    expect(p("a.c").test("abc")).toBe(false);
  });

  it("ignores case unless asked not to", () => {
    expect(p("monday").test("Open Monday")).toBe(true);
    expect(p("monday", { matchCase: true }).test("Open Monday")).toBe(false);
  });

  it("finds whole words only when asked, in any script", () => {
    expect(p("cat", { wholeWord: true }).test("category")).toBe(false);
    expect(p("cat", { wholeWord: true }).test("the cat sat")).toBe(true);
    expect(p("caf", { wholeWord: true }).test("café")).toBe(false);
    expect(p("Straße", { wholeWord: true }).test("Hauptstraße 1")).toBe(false);
  });

  it("is nothing for an empty or overlong search", () => {
    expect(findPattern("")).toBeNull();
    expect(findPattern("x".repeat(201))).toBeNull();
  });
});

describe("replacing in inline HTML", () => {
  it("changes the words between tags and never a tag", () => {
    const html = '<p>About <a href="/sites/x/about" title="about">about us</a></p>';
    const out = replaceInHtml(html, p("about"), "Story");
    expect(out.html).toBe('<p>Story <a href="/sites/x/about" title="about">Story us</a></p>');
    expect(out.count).toBe(2);
  });

  it("reads entities as the characters they stand for, and writes the replacement escaped", () => {
    const out = replaceInHtml("<p>Fish &amp; chips</p>", p("Fish & chips"), "Pie <and> mash");
    expect(out.html).toBe("<p>Pie &lt;and&gt; mash</p>");
  });

  it("leaves text it did not change exactly as it was written", () => {
    const html = "<p>Caf&eacute; &nbsp;open</p><p>Closed</p>";
    expect(replaceInHtml(html, p("Closed"), "Shut").html).toBe("<p>Caf&eacute; &nbsp;open</p><p>Shut</p>");
  });

  it("only counts when there is no replacement", () => {
    const html = "<p>one one</p>";
    expect(replaceInHtml(html, p("one"), null)).toEqual({ html, count: 2 });
  });
});

describe("the words either side of a match", () => {
  it("are plain text, cut short with an ellipsis", () => {
    const snippet = snippetOf(`<p>${"a ".repeat(40)}<b>Call</b> 01234 567890 ${"z ".repeat(40)}</p>`, p("01234 567890"))!;
    expect(snippet.match).toBe("01234 567890");
    expect(snippet.before.startsWith("…")).toBe(true);
    expect(snippet.before.endsWith("Call ")).toBe(true);
    expect(snippet.after.endsWith("…")).toBe(true);
  });
});

const tree = (): BaseBlock[] =>
  [
    { id: "h", type: "heading", props: { text: "Call 01234 567890", level: 2 } },
    {
      id: "s",
      type: "section",
      props: {},
      children: [
        { id: "t", type: "text", props: { text: '<p>Ring <a href="tel:01234567890">01234 567890</a> any day</p>' } },
        { id: "b", type: "button", props: { label: "Call us", href: "tel:+01234-567890" } },
      ],
    },
    { id: "i", type: "image", props: { src: "/uploads/a.jpg", alt: "The shop on 01234 567890 street" } },
    { id: "code", type: "code", props: { code: "call(01234 567890)" } },
  ] as unknown as BaseBlock[];

describe("finding in a page's blocks", () => {
  it("lists every block with it, in page order, with how many times", () => {
    const found = findInTree(tree(), p("01234 567890"));
    expect(found.map((f) => [f.blockId, f.count])).toEqual([
      ["h", 1],
      ["t", 1],
      ["i", 1],
    ]);
    expect(found[0].label).toBe("Heading");
  });

  it("finds the links to a phone number when the search is one", () => {
    const query = "01234 567890";
    const found = findInTree(tree(), p(query), contactLinks(query, null));
    expect(found.map((f) => [f.blockId, f.count])).toEqual([
      ["h", 1],
      ["t", 2],
      ["b", 1],
      ["i", 1],
    ]);
    expect(found[2].snippet).toEqual({ before: "Links to ", match: "+01234-567890", after: "" });
  });

  it("leaves code samples alone, which show text rather than say it", () => {
    expect(findInTree(tree(), p("call(")).map((f) => f.blockId)).toEqual([]);
  });
});

describe("replacing in a page's blocks", () => {
  const query = "01234 567890";

  it("changes the words and the links to the number together", () => {
    const out = replaceInTree(tree(), p(query), "07000 111222", undefined, contactLinks(query, "07000 111222"));
    const [h, s, i] = out.blocks;
    expect(h.props.text).toBe("Call 07000 111222");
    expect(s.children![0].props.text).toBe('<p>Ring <a href="tel:07000111222">07000 111222</a> any day</p>');
    expect(s.children![1].props).toEqual({ label: "Call us", href: "tel:07000111222" });
    expect(i.props.alt).toBe("The shop on 07000 111222 street");
    // The heading, the paragraph's words and its link, the button's link, the picture's description.
    expect(out.count).toBe(5);
  });

  it("leaves the links when the replacement is not a number, since a call has to go somewhere", () => {
    const out = replaceInTree(tree(), p(query), "the office", undefined, contactLinks(query, "the office"));
    expect(out.blocks[1].children![1].props.href).toBe("tel:+01234-567890");
    expect(out.blocks[1].children![0].props.text).toBe('<p>Ring <a href="tel:01234567890">the office</a> any day</p>');
  });

  it("changes only the blocks chosen", () => {
    const out = replaceInTree(tree(), p(query), "X", new Set(["t"]));
    expect(out.blocks[0].props.text).toBe("Call 01234 567890");
    expect(out.blocks[1].children![0].props.text).toContain("Ring <a");
    expect(out.blocks[1].children![0].props.text).toContain(">X</a>");
    expect(out.count).toBe(1);
  });

  it("hands back the very same tree when there was nothing to change", () => {
    const before = tree();
    expect(replaceInTree(before, p("nowhere"), "X").blocks).toBe(before);
  });

  it("rewrites an email address's mailto links with it", () => {
    const blocks = [{ id: "t", type: "text", props: { text: '<p><a href="mailto:Shop@Example.com?subject=Hi">shop@example.com</a></p>' } }] as unknown as BaseBlock[];
    const q = "shop@example.com";
    const out = replaceInTree(blocks, p(q), "hello@example.org", undefined, contactLinks(q, "hello@example.org"));
    expect(out.blocks[0].props.text).toBe('<p><a href="mailto:hello@example.org?subject=Hi">hello@example.org</a></p>');
  });
});

describe("which searches are phone numbers and email addresses", () => {
  it("takes digits with the usual punctuation as a number", () => {
    expect(contactLinks("+44 (0)1234 567-890", null)).not.toBeNull();
    expect(contactLinks("1234", null)).toBeNull();
    expect(contactLinks("Call 01234 567890", null)).toBeNull();
  });

  it("matches a number's links by their digits, however they were written", () => {
    const links = contactLinks("01234 567 890", null)!;
    expect(links.matches("tel:01234567890")).toBe(true);
    expect(links.matches("tel:01234-567-890")).toBe(true);
    expect(links.matches("tel:01234567891")).toBe(false);
    expect(links.matches("/sites/x/01234567890")).toBe(false);
  });
});

describe("synced blocks", () => {
  it("names a match inside a synced block by the synced block", () => {
    const blocks = [
      { id: "c", type: "section", props: {}, synced: "sb1", children: [{ id: "x", type: "text", props: { text: "<p>Open daily</p>" } }] },
    ] as unknown as BaseBlock[];
    expect(findInTree(blocks, p("daily"))).toEqual([expect.objectContaining({ blockId: "x", synced: "sb1" })]);
    expect(blocksInSynced(blocks, new Set(["sb1"]))).toEqual(["c", "x"]);
    expect(blocksInSynced(blocks, new Set(["other"]))).toEqual([]);
  });
});

describe("a page's own words", () => {
  const page = { title: "Opening hours", excerpt: null, metaTitle: "Hours | Shop", metaDescription: "When we are open" };

  it("are searched in the title and the search text", () => {
    expect(findInPage(page, p("hours")).map((f) => f.key)).toEqual(["title", "metaTitle"]);
  });

  it("change only in the fields chosen", () => {
    const out = replaceInPage(page, p("hours"), "times", new Set(["title"]));
    expect(out).toEqual({ patch: { title: "Opening times" }, count: 1 });
  });
});

describe("the site's own words", () => {
  const site = (): SiteWords => ({
    name: "Corner Shop",
    description: null,
    metaTitle: null,
    metaDescription: "Call 01234 567890",
    headerHtml: null,
    footerHtml: null,
    menu: JSON.stringify([
      { kind: "link", label: "Email us", href: "mailto:shop@example.com" },
      { kind: "page", page: "p1", label: "Shop hours" },
    ]),
    footer: JSON.stringify({
      about: "The corner shop since 1990.",
      columns: [{ title: "Shop", links: [{ label: "Call", href: "tel:01234567890" }] }],
      contact: { address: "1 High Street", phone: "01234 567890", email: "shop@example.com" },
      social: [],
      copyright: "",
      background: "",
    }),
  });

  it("are searched in the settings, the menu and the footer", () => {
    const q = "01234 567890";
    const found = findInSite(site(), p(q), contactLinks(q, null));
    expect(found.map((f) => f.key)).toEqual(["metaDescription", "footer.contact.phone", "footer.columns.0.links.0.href"]);
    expect(findInSite(site(), p("shop")).map((f) => f.key)).toEqual([
      "name",
      "menu.1.label",
      "footer.about",
      "footer.contact.email",
      "footer.columns.0.title",
    ]);
  });

  it("come back as the settings that changed, the menu and footer whole", () => {
    const q = "01234 567890";
    const all = new Set(["metaDescription", "footer.contact.phone", "footer.columns.0.links.0.href"]);
    const out = replaceInSite(site(), p(q), "07000 111222", all, contactLinks(q, "07000 111222"));
    expect(out.count).toBe(3);
    expect(Object.keys(out.patch).sort()).toEqual(["footer", "metaDescription"]);
    expect(out.patch.metaDescription).toBe("Call 07000 111222");
    const footer = out.patch.footer as { contact: { phone: string }; columns: { links: { href: string }[] }[] };
    expect(footer.contact.phone).toBe("07000 111222");
    expect(footer.columns[0].links[0].href).toBe("tel:07000111222");
  });

  it("rewrites a menu's mailto link with the address", () => {
    const q = "shop@example.com";
    const out = replaceInSite(site(), p(q), "hi@example.org", new Set(["menu.0.href", "footer.contact.email"]), contactLinks(q, "hi@example.org"));
    expect((out.patch.menu as { href?: string }[])[0].href).toBe("mailto:hi@example.org");
    expect((out.patch.footer as { contact: { email: string } }).contact.email).toBe("hi@example.org");
  });

  it("is nothing to write when nothing chosen had it", () => {
    expect(replaceInSite(site(), p("shop"), "store", new Set(["description"]))).toEqual({ patch: {}, count: 0 });
  });
});

describe("the find and replace route", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/sites/[id]/find/route.ts"), "utf8");

  it("writes trees through the validator and settings through the site's own rules", () => {
    expect(route).toMatch(/normalizeBlockTree\(inTree\.blocks\)/);
    expect(route).toMatch(/normalizeSiteFields\(change\.patch\)/);
  });

  it("keeps each page as a version before changing it", () => {
    const kept = route.indexOf("await keepAsVersion(");
    const written = route.indexOf("await prisma.page.update(");
    expect(kept).toBeGreaterThan(-1);
    expect(written).toBeGreaterThan(kept);
  });

  it("never writes a generated legal page, which the legal details would write straight back", () => {
    expect(route).toMatch(/const writable = pages\.filter\(\(\{ page \}\) => !isLegalKind\(page\.legalKind\)\)/);
    expect(route).toMatch(/for \(const \{ page, blocks \} of writable\)/);
  });

  it("brings synced copies on other pages along", () => {
    expect(route).toMatch(/settleSyncedBlocks\(page\.id, checked\.tree, undefined\)/);
    expect(route).toMatch(/blocksInSynced\(blocks, synced\)/);
  });
});
