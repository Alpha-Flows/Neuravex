import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Fallback } from "@/components/ui/Fallback";

/**
 * The builder's 404.
 *
 * Reached by the `notFound()` calls in the site and page routes — a site id
 * that has been deleted, a page that belongs to a different site, or a stale
 * bookmark. Before this it was Next's stock page, which on a program with no
 * navigation chrome of its own left the owner on a dead end.
 *
 * It sits beside `(builder)/layout.tsx` rather than at `src/app/`, because
 * that layout is what emits `<html>` for this half of the app; a file at the
 * root would render above it, outside the document.
 */
export default function BuilderNotFound() {
  return (
    <Fallback
      title="That page is not here"
      action={
        <Link href="/">
          <Button>All sites</Button>
        </Link>
      }
    >
      The site or page you asked for does not exist. It may have been deleted, or moved to
      the trash — deleted sites can be restored there for a while.
    </Fallback>
  );
}
