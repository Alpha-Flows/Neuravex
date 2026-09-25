"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { useRouter } from "next/navigation";
import { TEMPLATES, Template } from "@/lib/templates";
import { TemplatePreview } from "./TemplatePreview";
import { BaseBlock } from "@/types";

const CATEGORIES = [
  { id: null, label: "All" },
  { id: "landing" as const, label: "Landing" },
  { id: "portfolio" as const, label: "Portfolio" },
  { id: "business" as const, label: "Business" },
  { id: "blog" as const, label: "Blog" },
  { id: "minimal" as const, label: "Minimal" },
];

export function NewSiteButton({ large }: { large?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"meta" | "template">("meta");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accent, setAccent] = useState("#6366f1");
  const [templateId, setTemplateId] = useState<string | null>(null);
  // A template somebody saved from one of their own sites; see `lib/user-templates`.
  const [userTemplateId, setUserTemplateId] = useState<string | null>(null);
  const [kept, setKept] = useState<KeptTemplate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [templates] = useState<Template[]>(TEMPLATES);
  const [category, setCategory] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(
    () => (category ? templates.filter((t) => t.category === category) : templates),
    [category, templates],
  );

  function reset() {
    setOpen(false);
    setStep("meta");
    setName("");
    setDescription("");
    setAccent("#6366f1");
    setTemplateId(null);
    setUserTemplateId(null);
    setCategory(null);
  }

  /** The step with the templates, and the ones somebody saved, fetched as it opens. */
  function chooseTemplate() {
    setStep("template");
    fetch("/api/user-templates?kind=site")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: KeptTemplate[]) => setKept(Array.isArray(list) ? list : []))
      .catch(() => setKept([]));
  }

  async function forget(id: string) {
    const res = await fetch(`/api/user-templates/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setKept((list) => list.filter((t) => t.id !== id));
    if (userTemplateId === id) setUserTemplateId(null);
  }

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userTemplateId ? { name, description, userTemplateId } : { name, description, accent, templateId }),
      });
      const site = await res.json();
      router.push(`/admin/sites/${site.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size={large ? "lg" : "md"}>
        + New site
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={reset}>
          <div
            className="w-full max-w-4xl rounded-xl border border-bg-border bg-bg-soft shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {step === "meta" ? (
              <div className="p-6">
                <h2 className="text-lg font-semibold">Create a new site</h2>
                <p className="text-fg-muted text-sm mt-1">Name your site and pick an accent color.</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="My awesome site" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="desc">Description (optional)</Label>
                    <Textarea id="desc" rows={2} placeholder="What's this site about?" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <div>
                    <Label>Accent color</Label>
                    <div className="flex items-center gap-2">
                      {["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#0ea5e9", "#0f172a"].map((c) => (
                        <button key={c} aria-label={`Accent ${c}`} onClick={() => setAccent(c)} className={`w-7 h-7 rounded-full border-2 transition-transform ${accent === c ? "border-white scale-110" : "border-bg-border"}`} style={{ background: c }} />
                      ))}
                      <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-7 h-7 rounded-md bg-transparent border border-bg-border" />
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                  <Button variant="outline" onClick={chooseTemplate} disabled={!name.trim()}>
                    Choose template →
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Pick a starting point</h2>
                    <p className="text-fg-muted text-sm mt-1">You can change anything later.</p>
                  </div>
                  <button className="text-fg-muted text-sm hover:text-fg" onClick={() => setStep("meta")}>← Back</button>
                </div>

                {/* Category filter */}
                <div className="flex items-center gap-1.5 mb-4">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id ?? "all"}
                      onClick={() => setCategory(c.id)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        category === c.id
                          ? "bg-brand text-white border-brand"
                          : "border-bg-border text-fg-muted hover:text-fg hover:border-brand/50"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Template grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {kept.length > 0 ? (
                    <div className="col-span-full text-xs uppercase tracking-wide text-fg-subtle font-semibold">Your templates</div>
                  ) : null}
                  {kept.map((t) => (
                    <div key={t.id} className="relative">
                      <TemplateCard
                        selected={userTemplateId === t.id}
                        onClick={() => { setUserTemplateId(t.id); setTemplateId(null); }}
                        name={t.name}
                        description={`${t.pageCount} ${t.pageCount === 1 ? "page" : "pages"}, with your settings, menu and footer. Keeps its own colours.`}
                        blocks={t.preview}
                      />
                      <button
                        type="button"
                        onClick={() => void forget(t.id)}
                        aria-label={`Delete the template ${t.name}`}
                        title="Delete this template"
                        className="absolute top-2 right-2 w-6 h-6 rounded bg-bg-soft/90 text-fg-muted hover:text-red-400 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {kept.length > 0 ? (
                    <div className="col-span-full text-xs uppercase tracking-wide text-fg-subtle font-semibold mt-2">Neuravex templates</div>
                  ) : null}
                  <TemplateCard
                    selected={templateId === null && userTemplateId === null}
                    onClick={() => { setTemplateId(null); setUserTemplateId(null); }}
                    name="Blank"
                    description="Start with nothing but a clean page."
                    blocks={templates.find((t) => t.id === "blank")?.pages[0].blocks ?? []}
                  />
                  {filtered.map((t) => (
                    <TemplateCard
                      key={t.id}
                      selected={templateId === t.id}
                      onClick={() => { setTemplateId(t.id); setUserTemplateId(null); }}
                      name={t.name}
                      description={t.description}
                      blocks={t.pages[0].blocks}
                    />
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                  <Button onClick={submit} loading={submitting}>Create site</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** A template somebody saved, as the chooser lists it. */
interface KeptTemplate {
  id: string;
  name: string;
  pageCount: number;
  preview: BaseBlock[];
}

function TemplateCard({
  selected,
  onClick,
  name,
  description,
  blocks,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  description: string;
  blocks: BaseBlock[];
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border overflow-hidden transition-colors bg-bg-card ${
        selected ? "border-brand ring-1 ring-brand" : "border-bg-border hover:border-brand/50"
      }`}
    >
      <TemplatePreview blocks={blocks} />
      <div className="p-3">
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-fg-muted mt-0.5 line-clamp-2">{description}</div>
      </div>
    </button>
  );
}
