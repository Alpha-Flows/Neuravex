"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function DeletePageButton({ pageId, pageTitle }: { pageId: string; pageTitle: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function destroy() {
    if (!confirm(`Delete "${pageTitle}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={destroy} loading={deleting} className="text-red-400 hover:text-red-300">
      Delete
    </Button>
  );
}
