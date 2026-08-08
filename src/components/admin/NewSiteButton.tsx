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
    setCategory(null);
  }

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, accent, templateId }),
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
                  <Button variant="outline" onClick={() => setStep("template")} disabled={!name.trim()}>
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
                  <TemplateCard
                    selected={templateId === null}
                    onClick={() => setTemplateId(null)}
                    name="Blank"
                    description="Start with nothing but a clean page."
                    blocks={templates.find((t) => t.id === "blank")?.pages[0].blocks ?? []}
                  />
                  {filtered.map((t) => (
                    <TemplateCard
                      key={t.id}
                      selected={templateId === t.id}
                      onClick={() => setTemplateId(t.id)}
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
