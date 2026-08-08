"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function DuplicatePageButton({ pageId, siteId }: { pageId: string; siteId: string }) {
  const [duplicating, setDuplicating] = useState(false);
  const router = useRouter();

  async function dup() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/pages/${pageId}`);
      const page = await res.json();
      const newPage = await fetch(`/api/sites/${siteId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${page.title} (copy)`,
          slug: `${page.slug}-copy`,
          content: page.content,
        }),
      });
      if (newPage.ok) router.refresh();
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={dup} loading={duplicating}>
      Duplicate
    </Button>
  );
}
