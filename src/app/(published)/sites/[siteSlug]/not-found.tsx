import { headers } from "next/headers";
import { Fallback } from "@/components/ui/Fallback";
import { PublishedPageView, loadPublishedSite, type PublishedPageRow, type PublishedSite } from "@/components/public/PublishedPage";

/**
 * A visitor's 404, on a published site.
 *
 * Reached when the site slug names nothing, or the page within it does — an
 * unpublished page, a renamed one, a link that has gone stale since the site
 * was downloaded and put online.
 *
 * A site can have a page of its own for this — designed in the editor, with
 * the site's header and footer and a way back — and it is drawn here, with
 * the 404 status still on the response. `not-found.tsx` receives no route
 * params, so the site is read from the path the proxy passes along
 * (`x-nvx-path`), and the read sits inside a `try`: the most common way here
 * is a site that does not exist at all, and the read may be the very thing
 * that failed. Anything short of a published "not found" page gets the plain
 * message, which offers no link back — a "Home" link built from a path that
 * names no site would 404 again.
 *
 * `public-canvas` is what makes this white. `globals.css` sets `html, body`
 * to the builder's black for every document in the app, so a published page
 * that does not opt out renders on it, and that is not what the visitor's
 * site looks like.
 */
export default async function PublishedNotFound() {
  const found = await sitesOwnNotFoundPage();
  if (found) {
    return (
      <>
        <title>{found.page.title}</title>
        <PublishedPageView site={found.site} page={found.page} nonce={found.nonce} />
      </>
    );
  }
  return (
    <Fallback title="Page not found" tone="light">
      This page does not exist, or is no longer published.
    </Fallback>
  );
}

/** The site's own published "not found" page, or null for anything less. */
async function sitesOwnNotFoundPage(): Promise<{ site: PublishedSite; page: PublishedPageRow; nonce?: string } | null> {
  try {
    const request = await headers();
    const slug = /^\/sites\/([^/?#]+)/.exec(request.get("x-nvx-path") ?? "")?.[1];
    if (!slug) return null;
    const site = await loadPublishedSite(decodeURIComponent(slug));
    const page = site?.pages.find((p) => p.isNotFound);
    return site && page ? { site, page, nonce: request.get("x-nonce") ?? undefined } : null;
  } catch {
    return null;
  }
}
