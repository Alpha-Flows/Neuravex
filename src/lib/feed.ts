/**
 * The site's feed: its posts, newest first, for a feed reader.
 *
 * Atom rather than RSS 2.0, for one reason that matters here. A downloaded
 * site is a folder whose address nobody knows yet, and RSS wants every link
 * absolute; Atom resolves a relative link against the feed's own address,
 * so the same `feed.xml` works wherever the folder ends up. Every reader that
 * reads RSS reads Atom. The ids Atom asks for have to be absolute and must
 * not change, so they are `tag:` URIs made from the site's and the post's ids
 * rather than addresses, which would change with the domain.
 */
import type { PostItem } from "./posts";

/** The characters XML will not take as they are. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export interface FeedInput {
  siteId: string;
  siteName: string;
  /** Where the site's home page is, relative or absolute. */
  homeHref: string;
  /** Where this feed is, relative or absolute. */
  selfHref: string;
  /** A post's address, from its item. */
  hrefOf: (post: PostItem) => string;
  posts: PostItem[];
}

/** The most posts one feed carries; a reader wants the recent ones. */
export const FEED_LIMIT = 50;

/** The feed as Atom XML. */
export function atomFeed({ siteId, siteName, homeHref, selfHref, hrefOf, posts }: FeedInput): string {
  const items = posts.slice(0, FEED_LIMIT);
  const updated = items[0]?.date ?? new Date(0).toISOString();
  const entries = items.map((p) =>
    [
      "  <entry>",
      `    <id>tag:neuravex,2026:site-${xml(siteId)}/post-${xml(p.id)}</id>`,
      `    <title>${xml(p.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${xml(hrefOf(p))}"/>`,
      `    <published>${xml(p.date)}</published>`,
      `    <updated>${xml(p.date)}</updated>`,
      p.author ? `    <author><name>${xml(p.author)}</name></author>` : "",
      p.excerpt ? `    <summary>${xml(p.excerpt)}</summary>` : "",
      ...p.tags.map((t) => `    <category term="${xml(t)}"/>`),
      "  </entry>",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>tag:neuravex,2026:site-${xml(siteId)}</id>`,
    `  <title>${xml(siteName)}</title>`,
    `  <link rel="alternate" type="text/html" href="${xml(homeHref)}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${xml(selfHref)}"/>`,
    `  <updated>${xml(updated)}</updated>`,
    // Atom wants an author for every entry; one for the feed covers the posts
    // that name none.
    `  <author><name>${xml(siteName)}</name></author>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}
