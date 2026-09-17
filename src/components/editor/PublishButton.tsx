"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  isHome: boolean;
  published: boolean;
  siteSlug: string;
  pageSlug: string;
  /** Saves the page with the new published flag. Resolves false if it failed. */
  onToggle: (next: boolean) => Promise<boolean>;
}

export function PublishButton({ isHome, published, siteSlug, pageSlug, onToggle }: Props) {
  const [loading, setLoading] = useState(false);
  const url = isHome ? `/sites/${siteSlug}` : `/sites/${siteSlug}/${pageSlug}`;

  async function toggle() {
    setLoading(true);
    try {
      await onToggle(!published);
    } finally {
      setLoading(false);
    }
  }

  if (published) {
    return (
      <div className="inline-flex items-center gap-1">
        <a href={url} target="_blank" className="text-xs text-fg-muted hover:text-fg underline-offset-2 hover:underline">
          View live ↗
        </a>
        <Button size="sm" variant="outline" onClick={toggle} loading={loading}>
          Unpublish
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" onClick={toggle} loading={loading}>
      Publish
    </Button>
  );
}
