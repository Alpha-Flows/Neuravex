"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Keeps a site or a page as a template of one's own, under a name.
 *
 * Asked for inline rather than in a dialog: it is one field, and a template
 * named after the site or page it came from is usually right, so the name is
 * filled in and Enter is enough.
 */
export function SaveAsTemplateButton({
  siteId,
  pageId,
  defaultName,
  label,
}: {
  siteId?: string;
  pageId?: string;
  defaultName: string;
  label: string;
}) {
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/user-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteId ? { siteId, name } : { pageId, name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "That could not be kept as a template.");
        return;
      }
      setAsking(false);
      setDone(`Kept as "${body.name}". It is offered when you ${siteId ? "make a new site" : "add a page"}.`);
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <span className="inline-flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { setAsking(true); setDone(""); setName(defaultName); }}>
          {label}
        </Button>
        {done ? <span role="status" className="text-xs text-emerald-400">{done}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        aria-label="Template name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void save(); }
          if (e.key === "Escape") setAsking(false);
        }}
        className="h-8 w-44 text-sm"
      />
      <Button size="sm" onClick={save} loading={busy}>Keep</Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
      {error ? <span role="alert" className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}
