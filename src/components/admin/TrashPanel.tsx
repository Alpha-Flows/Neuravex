"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface TrashRow {
  id: string;
  kind: "site" | "page";
  label: string;
  siteName: string | null;
  deletedAt: string;
}

/**
 * What has been deleted, and the way back.
 *
 * A deleted site or page used to be gone the moment a browser confirm() was
 * accepted, taking its pages, their history and every form submission with it.
 * They are kept here whole instead, until someone empties this.
 */
export function TrashPanel() {
  const [items, setItems] = useState<TrashRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The row whose "Delete forever" has been pressed once, and is asking.
  const [confirming, setConfirming] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(() => {
    fetch("/api/trash")
      .then((r) => r.json())
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/trash/${id}`, { method: "POST" });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "That could not be put back.");
        return;
      }
      load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function forget(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/trash/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("That could not be deleted. It is still here.");
        return;
      }
      setItems((rows) => rows.filter((r) => r.id !== id));
      setConfirming(null);
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg"
        aria-expanded={open}
      >
        <span className="text-xs">{open ? "▾" : "▸"}</span>
        Trash
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-bg-soft border border-bg-border">{items.length}</span>
      </button>

      {open ? (
        <Card className="mt-3 divide-y divide-bg-border">
          {error ? <div className="px-4 py-3 text-xs text-red-400">{error}</div> : null}
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <span className="text-xs uppercase tracking-wide text-fg-subtle w-10 shrink-0">{item.kind}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.label}</div>
                <div className="text-xs text-fg-subtle">
                  {item.siteName ? `from ${item.siteName} · ` : ""}
                  deleted {new Date(item.deletedAt).toLocaleString()}
                </div>
              </div>
              {confirming === item.id ? (
                /*
                  One click used to be enough. An entry here is the last copy
                  of what was deleted — a site's every page, its history and
                  the submissions visitors sent it — so the second click is
                  the one that means it, and says what it means.
                */
                <div role="group" aria-label={`Delete ${item.label} forever?`} className="flex items-center gap-2 shrink-0" data-confirm-forget="">
                  <span className="text-xs text-red-300 max-w-[16rem]">
                    This is the last copy{item.kind === "site" ? ", with every page, its history and its form submissions" : ""}. There is no
                    way back.
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={busy === item.id}>
                    Keep it
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => forget(item.id)} loading={busy === item.id} autoFocus>
                    Delete for good
                  </Button>
                </div>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => restore(item.id)} loading={busy === item.id}>
                    Put back
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(item.id)}
                    disabled={busy === item.id}
                    className="text-red-400 hover:text-red-300"
                  >
                    Delete forever
                  </Button>
                </>
              )}
            </div>
          ))}
          <div className="px-4 py-2.5 text-xs text-fg-subtle">
            The 50 most recent deletions are kept here. Older ones are dropped as new ones arrive.
          </div>
        </Card>
      ) : null}
    </div>
  );
}
