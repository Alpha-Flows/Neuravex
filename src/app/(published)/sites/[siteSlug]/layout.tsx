import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { cleanLanguage } from "@/lib/translations";
import "../../../globals.css";

export const dynamic = "force-dynamic";

/**
 * A published site's document.
 *
 * This is the root layout for everything under /sites — the builder has its
 * own under (builder) — which is what lets a site declare the language it is
 * written in. `lang` was hardcoded to "en" for every site in every language,
 * and it is what a screen reader announces in and what a browser offers to
 * translate from.
 *
 * A page in another language than the site's says so here rather than in a
 * `lang` further in: `<html lang>` is the one a browser offers to translate
 * from and a search engine files the page under. A layout is not told which
 * page it is drawing, so the page is found from the path the proxy passes
 * along, the way the 404 boundary finds its site.
 *
 * The body carries no theme classes either: a visitor sees the site's own
 * styling rather than the builder's dark chrome, which the download then had
 * to strip back off.
 */
export default async function PublishedSiteLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ siteSlug: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  const pageSlug = pageSlugFrom((await headers()).get("x-nvx-path"));
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: {
      language: true,
      pages: {
        where: pageSlug ? { slug: pageSlug, published: true } : { isHome: true, published: true },
        select: { language: true },
        take: 1,
      },
    },
  });
  const language = cleanLanguage(site?.pages[0]?.language) ?? site?.language ?? "en";

  return (
    <html lang={language || "en"}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

/** The page part of `/sites/<site>/<page>`, or empty for the site's home. */
function pageSlugFrom(path: string | null): string {
  const rest = /^\/sites\/[^/?#]+\/?([^?#]*)/.exec(path ?? "")?.[1] ?? "";
  try {
    return decodeURIComponent(rest.replace(/\/+$/, ""));
  } catch {
    return "";
  }
}
