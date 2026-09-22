"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Fallback } from "@/components/ui/Fallback";

/**
 * The builder's failure page.
 *
 * `src/lib/block-tree.ts` was written because a malformed block tree became
 * "a durable 500 the owner could not click past" — it stops one being stored,
 * but nothing caught what a render still threw, and every page here is
 * `force-dynamic`, so each one is a live database read that can fail on its
 * own. This is the thing to click past.
 *
 * The error's message is deliberately not shown. In production Next already
 * replaces a server-side message with a digest, but a client-side throw
 * arrives intact, and here that can carry a filesystem path or a fragment of
 * SQL. The digest is the whole of what a reader needs to match it against the
 * line in their terminal.
 */
export default function BuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The terminal the owner started Neuravex in is where they will look.
    console.error("[neuravex]", error);
  }, [error]);

  return (
    <Fallback
      title="Neuravex could not draw this page"
      action={
        <>
          <Button onClick={reset}>Try again</Button>
          <Link href="/">
            <Button variant="outline">All sites</Button>
          </Link>
        </>
      }
    >
      <p>
        Something went wrong while loading it. Your sites are stored on this machine and
        nothing here has been changed.
      </p>
      <p className="mt-3">The window Neuravex is running in has the details.</p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-fg-subtle">Reference {error.digest}</p>
      ) : null}
    </Fallback>
  );
}
