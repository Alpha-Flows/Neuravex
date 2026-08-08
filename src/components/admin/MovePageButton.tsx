"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function MovePageButton({
  pageId,
  direction,
  disabled,
}: {
  pageId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function move() {
    setLoading(true);
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: direction === "up" ? "decrement" : "increment" }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={move} loading={loading} disabled={disabled} className="px-1.5">
      {direction === "up" ? "↑" : "↓"}
    </Button>
  );
}
