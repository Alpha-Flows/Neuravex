"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Fallback } from "@/components/ui/Fallback";

/**
 * A visitor's failure page, on a published site.
 *
 * The published page is `force-dynamic` and reads the database on every
 * request, so a locked database or a row it cannot make sense of used to be a
 * blank 500. A visitor cannot fix any of that, so this says only what is true
 * and offers the one thing that sometimes helps.
 *
 * Nothing here names Neuravex, the database or the operator: this is a page on
 * somebody's public website, and what went wrong behind it is not the
 * visitor's business.
 */
export default function PublishedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[neuravex]", error);
  }, [error]);

  return (
    <Fallback
      title="This page could not be loaded"
      tone="light"
      action={<Button onClick={reset}>Try again</Button>}
    >
      Something went wrong while loading it. Please try again in a moment.
    </Fallback>
  );
}
