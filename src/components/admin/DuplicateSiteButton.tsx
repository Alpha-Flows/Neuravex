"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Copies the whole site and opens the copy. The copy is a separate site from
 * the moment it exists, with its own address, so nothing done to it reaches
 * the original.
 */
export function DuplicateSiteButton({ siteId }: { siteId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function duplicate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/duplicate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.id !== "string") {
        setError(typeof body.error === "string" ? body.error : "That site could not be copied.");
        return;
      }
      router.push(`/admin/sites/${body.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={duplicate} loading={busy} title="A copy of every page and setting, as a separate site">
        Duplicate site
      </Button>
      {error ? <span role="alert" className="text-xs text-red-400">{error}</span> : null}
    </>
  );
}
