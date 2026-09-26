"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useDialog } from "@/components/ui/use-dialog";
import { slugify } from "@/lib/utils";

/**
 * A new blog post: a title, and the editor opens on it. The first post of a
 * site also makes a Blog page to list them on, as a draft; see the pages
 * route.
 */
export function NewPostButton({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useDialog(open, () => setOpen(false));
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug: slugify(title), post: true }),
      });
      const page = await res.json();
      if (res.ok && typeof page.id === "string") router.push(`/admin/sites/${siteId}/pages/${page.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>+ New post</Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="New post"
            tabIndex={-1}
            className="w-full max-w-md rounded-xl border border-bg-border bg-bg-soft p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">New post</h2>
            <div className="mt-4">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void submit(); }
                }}
                placeholder="What we learned this spring"
              />
              <p className="text-xs text-fg-subtle mt-2">
                Dated today and kept as a draft until you publish it. Its date, author, summary, cover and tags are in
                the editor&apos;s page settings.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} loading={busy} disabled={!title.trim()}>Create post</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
