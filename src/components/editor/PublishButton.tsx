"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  pageId: string;
  isHome: boolean;
  published: boolean;
  siteSlug: string;
  pageSlug: string;
  onPublished: (next: boolean) => void;
}

export function PublishButton({ pageId, isHome, published, siteSlug, pageSlug, onPublished }: Props) {
  const [loading, setLoading] = useState(false);
  const url = isHome ? `/sites/${siteSlug}` : `/sites/${siteSlug}/${pageSlug}`;

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published }),
      });
      if (res.ok) onPublished(!published);
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
