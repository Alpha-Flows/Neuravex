import { prisma } from "@/lib/prisma";
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

  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: { language: true },
  });

  return (
    <html lang={site?.language || "en"}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
