"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";

interface SiteInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
  theme: string;
}

type Tab = "general" | "theme" | "layout" | "seo" | "advanced";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "theme", label: "Theme" },
  { id: "layout", label: "Header/Footer" },
  { id: "seo", label: "SEO" },
  { id: "advanced", label: "Advanced" },
];

export function SiteSettings({ site }: { site: SiteInfo }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("general");
  // General
  const [name, setName] = useState(site.name);
  const [slug, setSlug] = useState(site.slug);
  const [description, setDescription] = useState(site.description ?? "");
  const [accent, setAccent] = useState(site.accent);
  // Theme
  const [fontFamily, setFontFamily] = useState("");
  const [headingFont, setHeadingFont] = useState("");
  const [borderRadius, setBorderRadius] = useState("0.5rem");
  // Layout
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  // SEO
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  // Advanced
  const [customCss, setCustomCss] = useState("");
  // State
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  function openModal() {
    setOpen(true);
    if (!loaded) {
      fetch(`/api/sites/${site.id}`)
        .then((r) => r.json())
        .then((s) => {
          setName(s.name);
          setSlug(s.slug);
          setDescription(s.description ?? "");
          setAccent(s.accent);
          setFontFamily(s.fontFamily ?? "");
          setHeadingFont(s.headingFont ?? "");
          setBorderRadius(s.borderRadius ?? "0.5rem");
          setHeaderHtml(s.headerHtml ?? "");
          setFooterHtml(s.footerHtml ?? "");
          setMetaTitle(s.metaTitle ?? "");
          setMetaDescription(s.metaDescription ?? "");
          setOgImage(s.ogImage ?? "");
          setCustomCss(s.customCss ?? "");
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, slug, description: description || null, accent,
          fontFamily: fontFamily || null,
          headingFont: headingFont || null,
          borderRadius: borderRadius || null,
          headerHtml: headerHtml || null,
          footerHtml: footerHtml || null,
          metaTitle: metaTitle || null,
          metaDescription: metaDescription || null,
          ogImage: ogImage || null,
          customCss: customCss || null,
        }),
      });
      router.refresh();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (!confirm("Delete this site and all its pages? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={openModal}>Settings</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-xl border border-bg-border bg-bg-soft shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Tabs */}
            <div className="flex border-b border-bg-border px-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-3 text-sm border-b-2 -mb-px transition-colors ${
                    tab === t.id ? "border-brand text-fg font-medium" : "border-transparent text-fg-muted hover:text-fg"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-5 max-h-[460px] overflow-y-auto">
              {tab === "general" && (
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div><Label>Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
                  <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                  <div>
                    <Label>Accent color</Label>
                    <div className="flex items-center gap-2">
                      {["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#0ea5e9", "#0f172a"].map((c) => (
                        <button key={c} onClick={() => setAccent(c)} className={`w-7 h-7 rounded-full border-2 ${accent === c ? "border-white" : "border-bg-border"}`} style={{ background: c }} />
                      ))}
                      <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-7 h-7 rounded-md bg-transparent border border-bg-border" />
                    </div>
                  </div>
                </div>
              )}
              {tab === "theme" && (
                <div className="space-y-3">
                  <div><Label>Body font</Label><Input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} placeholder="Inter, system-ui, sans-serif" /></div>
                  <div><Label>Heading font</Label><Input value={headingFont} onChange={(e) => setHeadingFont(e.target.value)} placeholder="Georgia, serif" /></div>
                  <div><Label>Border radius</Label><Input value={borderRadius} onChange={(e) => setBorderRadius(e.target.value)} placeholder="0.5rem" /></div>
                  <p className="text-xs text-fg-subtle">Fonts must be available on the visitor&apos;s system or loaded via a Google Fonts link in Advanced → Custom CSS.</p>
                </div>
              )}
              {tab === "layout" && (
                <div className="space-y-3">
                  <div>
                    <Label>Header</Label>
                    <Textarea rows={4} value={headerHtml} onChange={(e) => setHeaderHtml(e.target.value)} placeholder="Leave empty for the default header. Use HTML." />
                    <p className="text-xs text-fg-subtle mt-1">Custom HTML that replaces the default site header. Use <code>{`{name}`}</code> for the site name, <code>{`{nav}`}</code> for the page navigation.</p>
                  </div>
                  <div>
                    <Label>Footer</Label>
                    <Textarea rows={4} value={footerHtml} onChange={(e) => setFooterHtml(e.target.value)} placeholder="Leave empty for the default footer. Use HTML." />
                    <p className="text-xs text-fg-subtle mt-1">Use <code>{`{name}`}</code> and <code>{`{year}`}</code> as placeholders.</p>
                  </div>
                </div>
              )}
              {tab === "seo" && (
                <div className="space-y-3">
                  <div><Label>Meta title (site default)</Label><Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="My Site" /></div>
                  <div><Label>Meta description</Label><Textarea rows={3} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="A description for search engines." /></div>
                  <div><Label>OG Image URL</Label><Input value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="https://…/og.png" /></div>
                </div>
              )}
              {tab === "advanced" && (
                <div className="space-y-3">
                  <div>
                    <Label>Custom CSS</Label>
                    <Textarea rows={8} value={customCss} onChange={(e) => setCustomCss(e.target.value)} placeholder="/* Custom styles injected on every page */" />
                  </div>
                  <div className="flex gap-2">
                    <a href={`/api/sites/${site.id}/export`} className="text-xs text-fg-muted hover:text-fg underline">Export site as JSON</a>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex items-center justify-between">
              <Button variant="danger" onClick={destroy} loading={deleting}>Delete site</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} loading={saving}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
