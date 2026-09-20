"use client";
import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { slugify } from "@/lib/utils";

export function NewPageButton({ siteId, siteSlug }: { siteId: string; siteSlug: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  // What the server will make of what has been typed so far. The dialog used
  // to promise "/sites/<site>/auto", which is not an address anyone has: the
  // site was never named, and neither was the page being created.
  const preview = slugify(slug || title);

  async function submit() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug: slug || slugify(title) }),
      });
      const page = await res.json();
      router.push(`/admin/sites/${siteId}/pages/${page.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Enter is how a two-field dialog is finished; it used to do nothing at all.
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New page</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-bg-border bg-bg-soft p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">New page</h2>
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="t">Title</Label>
                <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKeyDown} autoFocus placeholder="About" />
              </div>
              <div>
                <Label htmlFor="s">Slug (optional)</Label>
                <Input id="s" value={slug} onChange={(e) => setSlug(e.target.value)} onKeyDown={onKeyDown} placeholder="about" />
                <p className="text-xs text-fg-subtle mt-1 break-all">
                  URL: /sites/{siteSlug}/{preview || <span className="text-fg-muted">…</span>}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} loading={submitting} disabled={!title.trim()}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
