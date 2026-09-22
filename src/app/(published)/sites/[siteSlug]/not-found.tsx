import { Fallback } from "@/components/ui/Fallback";

/**
 * A visitor's 404, on a published site.
 *
 * Reached when the site slug names nothing, or the page within it does — an
 * unpublished page, a renamed one, a link that has gone stale since the site
 * was downloaded and put online.
 *
 * It does no database read and offers no link back, which is deliberate:
 * `not-found.tsx` receives no route params, so it cannot know which site it
 * is standing in without a query, and the most common way to get here is a
 * site that does not exist at all. A "Home" link built from the path would
 * 404 again. Saying less is better than guessing.
 *
 * `public-canvas` is what makes this white. `globals.css` sets `html, body`
 * to the builder's black for every document in the app, so a published page
 * that does not opt out renders on it, and that is not what the visitor's
 * site looks like.
 */
export default function PublishedNotFound() {
  return (
    <Fallback title="Page not found" tone="light">
      This page does not exist, or is no longer published.
    </Fallback>
  );
}
