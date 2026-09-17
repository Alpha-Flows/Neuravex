"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDelete } from "./ConfirmDelete";

export function DeletePageButton({ pageId, pageTitle }: { pageId: string; pageTitle: string }) {
  const [asking, setAsking] = useState(false);
  const router = useRouter();

  async function destroy() {
    const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete failed");
    setAsking(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setAsking(true)} className="text-red-400 hover:text-red-300">
        Delete
      </Button>
      <ConfirmDelete
        open={asking}
        onClose={() => setAsking(false)}
        kind="page"
        name={pageTitle}
        costUrl={`/api/pages/${pageId}?cost=1`}
        onConfirm={destroy}
      />
    </>
  );
}
