"use client";
import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { slugify } from "@/lib/utils";
import { PAGE_STARTERS, DEFAULT_STARTER } from "@/lib/page-starters";

export function NewPageButton({ siteId, siteSlug }: { siteId: string; siteSlug: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [starter, setStarter] = useState(DEFAULT_STARTER);
  // A page somebody kept as a template, chosen instead of a starter.
  const [userTemplateId, setUserTemplateId] = useState<string | null>(null);
  const [kept, setKept] = useState<{ id: string; name: string }[]>([]);
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
        body: JSON.stringify({ title, slug: slug || slugify(title), ...(userTemplateId ? { userTemplateId } : { starter }) }),
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
      <Button
        onClick={() => {
          setOpen(true);
          // The pages somebody kept, offered beside the starters.
          fetch("/api/user-templates?kind=page")
            .then((r) => (r.ok ? r.json() : []))
            .then((list: { id: string; name: string }[]) => setKept(Array.isArray(list) ? list : []))
            .catch(() => setKept([]));
        }}
      >
        + New page
      </Button>
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
            <div className="mt-4">
              <Label>Start from</Label>
              {/*
                A new page used to be handed over empty, which on a site built
                from a template meant the one page that looked like nothing
                else in it. Each of these is drawn in the site's own colours,
                section padding and column width, read off the pages it
                already has.
              */}
              <div className="grid grid-cols-2 gap-1.5">
                {PAGE_STARTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setStarter(s.id); setUserTemplateId(null); }}
                    aria-pressed={!userTemplateId && starter === s.id}
                    title={s.description}
                    className={
                      "text-left text-sm px-3 py-2 rounded-md border transition-colors " +
                      (!userTemplateId && starter === s.id
                        ? "border-brand bg-brand/15 text-fg"
                        : "border-bg-border text-fg-muted hover:text-fg hover:border-fg-subtle")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {kept.length > 0 ? (
                <>
                  <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-semibold mt-3 mb-1">Your pages</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {kept.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setUserTemplateId(t.id)}
                        aria-pressed={userTemplateId === t.id}
                        className={
                          "text-left text-sm px-3 py-2 rounded-md border transition-colors truncate " +
                          (userTemplateId === t.id
                            ? "border-brand bg-brand/15 text-fg"
                            : "border-bg-border text-fg-muted hover:text-fg hover:border-fg-subtle")
                        }
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <p className="text-xs text-fg-subtle mt-1.5">
                {userTemplateId
                  ? "A page you kept, with its links moved to this site."
                  : PAGE_STARTERS.find((s) => s.id === starter)?.description}
              </p>
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
