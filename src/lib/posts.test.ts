import { describe, it, expect } from "vitest";
import { cleanTags, formatPostDate, normalizePostFields, postDateFrom, postDateInput, postItems, type PostRow } from "@/lib/posts";
import { atomFeed } from "@/lib/feed";
import { normalizeBlockTree } from "@/lib/block-tree";
import { normalizeArchivePages } from "@/lib/site-archive";

const row = (over: Partial<PostRow>): PostRow => ({
  id: "p",
  slug: "p",
  title: "P",
  isHome: false,
  isPost: true,
  postDate: null,
  author: null,
  excerpt: null,
  coverImage: null,
  tags: null,
  ...over,
});

describe("a post's details", () => {
  it("take tags as typed, tidied, each once, ten at most", () => {
    expect(cleanTags(" Recipes, autumn ,recipes,, Soups ")).toEqual(["Recipes", "autumn", "Soups"]);
    expect(cleanTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(cleanTags(null)).toEqual([]);
  });

  it("keep a day as noon on that day, so no time zone moves it", () => {
    expect(postDateFrom("2026-09-25")?.toISOString()).toBe("2026-09-25T12:00:00.000Z");
    expect(postDateFrom("not a date")).toBeNull();
    expect(postDateInput("2026-09-25T12:00:00.000Z")).toBe("2026-09-25");
    expect(formatPostDate("2026-09-25T12:00:00.000Z", "en")).toBe("September 25, 2026");
    expect(formatPostDate("2026-09-25T12:00:00.000Z", "de")).toBe("25. September 2026");
  });

  it("are stored repaired, and only the ones sent", () => {
    expect(
      normalizePostFields({
        isPost: true,
        postDate: "2026-01-02",
        author: "  Ada   Lovelace ",
        excerpt: "",
        coverImage: "javascript:alert(1)",
        tags: "a, b",
      }),
    ).toEqual({
      isPost: true,
      postDate: new Date("2026-01-02T12:00:00.000Z"),
      author: "Ada Lovelace",
      excerpt: null,
      coverImage: null,
      tags: "a, b",
    });
    expect(normalizePostFields({ title: "x" })).toEqual({});
    expect(normalizePostFields({ coverImage: "/uploads/c.jpg" })).toEqual({ coverImage: "/uploads/c.jpg" });
  });
});

describe("a site's posts", () => {
  it("are its post pages, newest first, with their addresses", () => {
    const items = postItems(
      [
        row({ id: "a", slug: "old", title: "Old", postDate: new Date("2025-01-01T12:00:00Z") }),
        row({ id: "b", slug: "new", title: "New", postDate: new Date("2026-01-01T12:00:00Z"), tags: "x, y", coverImage: "/uploads/c.jpg" }),
        row({ id: "c", slug: "about", title: "About", isPost: false }),
      ],
      "acme",
    );
    expect(items.map((p) => [p.title, p.href])).toEqual([
      ["New", "/sites/acme/new"],
      ["Old", "/sites/acme/old"],
    ]);
    expect(items[0].tags).toEqual(["x", "y"]);
    expect(items[0].coverImage).toBe("/uploads/c.jpg");
  });

  it("are listed by a block that keeps only how, never which", () => {
    const result = normalizeBlockTree([{ id: "l", type: "posts", props: { count: 99, layout: "masonry", tag: "  recipes ", items: [{ title: "stored" }] } }]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].props).toEqual({ count: 6, layout: "grid", tag: "recipes", showCover: true, showExcerpt: true, showDate: true });
  });

  it("keep their details through an archive, repaired, and one 'not found' page per site", () => {
    const pages = normalizeArchivePages([
      { title: "A", slug: "a", content: "[]", isPost: true, postDate: "2026-02-03T12:00:00.000Z", tags: "x", coverImage: "javascript:1", isNotFound: true },
      { title: "B", slug: "b", content: "[]", isNotFound: true },
    ]);
    expect(pages[0]).toMatchObject({ isPost: true, tags: "x", coverImage: null, isNotFound: true });
    expect(pages[0].postDate?.toISOString()).toBe("2026-02-03T12:00:00.000Z");
    expect(pages[1].isNotFound).toBe(false);
  });
});

describe("the feed", () => {
  const posts = postItems(
    [row({ id: "p1", slug: "hello", title: "Fish & <chips>", author: "Ada", excerpt: "A \"quoted\" line", tags: "food", postDate: new Date("2026-03-04T12:00:00Z") })],
    "acme",
  );

  it("is Atom, escaped, with ids that do not depend on the address", () => {
    const xml = atomFeed({ siteId: "s1", siteName: "Acme", homeHref: "index.html", selfHref: "feed.xml", hrefOf: () => "hello.html", posts });
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain("<id>tag:neuravex,2026:site-s1/post-p1</id>");
    expect(xml).toContain("<title>Fish &amp; &lt;chips&gt;</title>");
    expect(xml).toContain("<summary>A &quot;quoted&quot; line</summary>");
    expect(xml).toContain('<link rel="alternate" type="text/html" href="hello.html"/>');
    expect(xml).toContain('<category term="food"/>');
    expect(xml).toContain("<updated>2026-03-04T12:00:00.000Z</updated>");
  });

  it("still names an author and a time when there are no posts", () => {
    const xml = atomFeed({ siteId: "s1", siteName: "Acme", homeHref: "/", selfHref: "/feed.xml", hrefOf: () => "/", posts: [] });
    expect(xml).toContain("<author><name>Acme</name></author>");
    expect(xml).toContain("<updated>1970-01-01T00:00:00.000Z</updated>");
    expect(xml).not.toContain("<entry>");
  });
});
