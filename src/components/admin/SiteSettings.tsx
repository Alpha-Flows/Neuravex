"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { ConfirmDelete } from "./ConfirmDelete";
import { CONTENT_WIDTHS, THEME_FALLBACK } from "@/lib/site-theme";
import { familyOf, normalizeCustomFonts, type CustomFont } from "@/lib/fonts";
import { FontPicker, SiteFontFiles } from "./FontPicker";
import { PaletteEditor, TextSizeFields } from "./BrandFields";
import { FooterEditor, LogoField, MenuEditor, type ChromePage } from "./ChromeFields";
import { normalizeLogo, type SiteLogo } from "@/lib/site-logo";
import { editableMenu, type MenuEntry } from "@/lib/menu";
import { normalizeFooter, type FooterDesign } from "@/lib/footer";
import { normalizePalette } from "@/lib/palette";
import { normalizeTextStyles, type TextStyles } from "@/lib/text-styles";

interface SiteInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
}

/**
 * The pages the menu leaves out: the generated legal pages, which the footer
 * carries, the "not found" page, which is what a missing address shows, and
 * blog posts, which the posts block lists.
 * The legal test is `isLegalKind`'s, written out here because the module that
 * holds it builds the notices and has no place in the browser.
 */
const leftOutOfMenu = (p: { legalKind?: string | null; isNotFound?: boolean; isPost?: boolean }) =>
  p.legalKind === "impressum" || p.legalKind === "datenschutz" || p.isNotFound === true || p.isPost === true;

type Tab = "general" | "theme" | "layout" | "menu" | "footer" | "seo" | "advanced";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "theme", label: "Theme" },
  { id: "layout", label: "Header" },
  { id: "menu", label: "Menu" },
  { id: "footer", label: "Footer" },
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
  const [palette, setPalette] = useState<string[]>([]);
  // Theme
  const [fontFamily, setFontFamily] = useState("");
  const [headingFont, setHeadingFont] = useState("");
  const [fonts, setFonts] = useState<CustomFont[]>([]);
  const [textStyles, setTextStyles] = useState<TextStyles>({});
  const [borderRadius, setBorderRadius] = useState("0.5rem");
  const [contentWidth, setContentWidth] = useState<string>(THEME_FALLBACK.contentWidth);
  // Layout
  const [headerBackground, setHeaderBackground] = useState("#ffffff");
  const [headerOpacity, setHeaderOpacity] = useState(80);
  const [headerShape, setHeaderShape] = useState<"bar" | "rounded" | "pill">("bar");
  const [headerPosition, setHeaderPosition] = useState<"static" | "sticky" | "fixed">("sticky");
  const [headerHtml, setHeaderHtml] = useState("");
  const [logo, setLogo] = useState<SiteLogo | null>(null);
  // The menu is sent only once it has been touched, so a site whose menu was
  // never arranged keeps following its pages rather than a copy of them.
  const [menu, setMenu] = useState<MenuEntry[] | null>(null);
  const [storedMenu, setStoredMenu] = useState<string | null>(null);
  const [menuPages, setMenuPages] = useState<ChromePage[]>([]);
  const [footer, setFooter] = useState<FooterDesign | null>(null);
  const [footerHtml, setFooterHtml] = useState("");
  // SEO
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [favicon, setFavicon] = useState("");
  const [language, setLanguage] = useState("en");
  // Advanced
  const [customCss, setCustomCss] = useState("");
  // State
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
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
          setPalette(normalizePalette(s.palette));
          setFontFamily(s.fontFamily ?? "");
          setHeadingFont(s.headingFont ?? "");
          setFonts(normalizeCustomFonts(s.fonts));
          setTextStyles(normalizeTextStyles(s.textStyles));
          setBorderRadius(s.borderRadius ?? "0.5rem");
          setContentWidth(s.contentWidth || THEME_FALLBACK.contentWidth);
          setHeaderBackground(s.headerBackground ?? "#ffffff");
          setHeaderOpacity(typeof s.headerOpacity === "number" ? s.headerOpacity : 80);
          setHeaderShape(s.headerShape ?? "bar");
          setHeaderPosition(s.headerPosition ?? "sticky");
          setHeaderHtml(s.headerHtml ?? "");
          setLogo(normalizeLogo(s.logo));
          setFooter(normalizeFooter(s.footer));
          setStoredMenu(s.menu ?? null);
          setMenu(null);
          setMenuPages(
            (Array.isArray(s.pages) ? s.pages : []).map((p: ChromePage) => ({
              id: p.id,
              slug: p.slug,
              title: p.title,
              isHome: p.isHome,
              published: p.published,
              legalKind: p.legalKind,
              isNotFound: p.isNotFound,
              isPost: p.isPost,
            })),
          );
          setFooterHtml(s.footerHtml ?? "");
          setMetaTitle(s.metaTitle ?? "");
          setMetaDescription(s.metaDescription ?? "");
          setOgImage(s.ogImage ?? "");
          setFavicon(s.favicon ?? "");
          setLanguage(s.language ?? "en");
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
          name, slug, description: description || null, accent, palette,
          fontFamily: fontFamily || null,
          headingFont: headingFont || null,
          fonts,
          textStyles,
          borderRadius: borderRadius || null,
          contentWidth,
          headerBackground, headerOpacity, headerShape, headerPosition,
          headerHtml: headerHtml || null,
          logo,
          footer,
          ...(menu ? { menu } : {}),
          footerHtml: footerHtml || null,
          metaTitle: metaTitle || null,
          metaDescription: metaDescription || null,
          ogImage: ogImage || null,
          favicon: favicon || null,
          language: language.trim() || "en",
          customCss: customCss || null,
        }),
      });
      router.refresh();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  /**
   * The site's font files, changed. A field left naming a family whose last
   * file was just taken away is set back to the default, rather than asking
   * every visitor for a font that is no longer declared anywhere.
   */
  function changeFonts(next: CustomFont[]) {
    const left = new Set(next.map((f) => f.family.toLowerCase()));
    const gone = (stack: string) => {
      const family = familyOf(stack).toLowerCase();
      return family !== "" && fonts.some((f) => f.family.toLowerCase() === family) && !left.has(family);
    };
    if (gone(fontFamily)) setFontFamily("");
    if (gone(headingFont)) setHeadingFont("");
    setFonts(next);
  }

  async function destroy() {
    const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete failed");
    router.push("/");
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
                    <p className="text-xs text-fg-subtle mt-1.5">
                      Used by every button that has not been given a colour of its own. A block keeps any colour you set
                      on it — the inspector&apos;s &quot;Use site accent&quot; hands it back.
                    </p>
                  </div>
                  <PaletteEditor palette={palette} onChange={setPalette} />
                </div>
              )}
              {tab === "theme" && (
                <div className="space-y-3">
                  <FontPicker label="Body font" value={fontFamily} onChange={setFontFamily} custom={fonts} unsetLabel="The system font" />
                  <FontPicker label="Heading font" value={headingFont} onChange={setHeadingFont} custom={fonts} unsetLabel="Same as the body" />
                  <SiteFontFiles fonts={fonts} onChange={changeFonts} />
                  <p className="text-xs text-fg-subtle">
                    The fonts Neuravex carries and your own files both go into a downloaded site beside its
                    pages, so a font looks the same on every visitor&apos;s screen with nothing fetched from
                    anywhere else.
                  </p>
                  <TextSizeFields styles={textStyles} onChange={setTextStyles} />
                  <div><Label>Border radius</Label><Input value={borderRadius} onChange={(e) => setBorderRadius(e.target.value)} placeholder="0.5rem" /></div>
                  <div>
                    <Label>Content width</Label>
                    <div className="grid grid-cols-5 gap-1">
                      {CONTENT_WIDTHS.map((w) => (
                        <button
                          key={w.value}
                          onClick={() => setContentWidth(w.value)}
                          title={w.hint}
                          className={`h-8 rounded-md text-[11px] border ${
                            contentWidth === w.value
                              ? "bg-brand text-white border-brand"
                              : "border-bg-border text-fg-muted hover:text-fg hover:bg-bg-card"
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-fg-subtle mt-1">
                      How wide the page runs on a large screen. It governs the header, the footer, and every
                      section set to follow the site.
                    </p>
                  </div>
                </div>
              )}
              {tab === "layout" && (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-wide text-fg-subtle font-semibold">Header style</div>
                  <div>
                    <Label>Background color</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={headerBackground} onChange={(e) => setHeaderBackground(e.target.value)} className="w-9 h-9 rounded-md bg-transparent border border-bg-border" />
                      <Input value={headerBackground} onChange={(e) => setHeaderBackground(e.target.value)} className="flex-1 font-mono text-xs" />
                    </div>
                  </div>
                  <div>
                    <Label>Opacity — {headerOpacity}%</Label>
                    <input type="range" min={0} max={100} value={headerOpacity} onChange={(e) => setHeaderOpacity(Number(e.target.value))} className="w-full accent-brand" />
                  </div>
                  <div>
                    <Label>Shape</Label>
                    <div className="inline-flex rounded-md border border-bg-border overflow-hidden w-full">
                      {(["bar", "rounded", "pill"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setHeaderShape(s)}
                          className={`flex-1 h-8 text-xs capitalize ${headerShape === s ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card"}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Placement</Label>
                    <div className="inline-flex rounded-md border border-bg-border overflow-hidden w-full">
                      {(["static", "sticky", "fixed"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setHeaderPosition(p)}
                          className={`flex-1 h-8 text-xs capitalize ${headerPosition === p ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card"}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-fg-subtle mt-1">
                      Text color switches automatically for light or dark backgrounds. &quot;Sticky&quot; keeps the header
                      in view as the page scrolls; &quot;Fixed&quot; floats it on top, and the page leaves room for it.
                    </p>
                  </div>
                  <div className="pt-3 border-t border-bg-border">
                    <LogoField logo={logo} onChange={setLogo} />
                  </div>
                  <div className="pt-3 border-t border-bg-border">
                    <Label>Custom header HTML (overrides the style controls above)</Label>
                    <Textarea rows={4} value={headerHtml} onChange={(e) => setHeaderHtml(e.target.value)} placeholder="Leave empty to use the header style controls above." />
                    <p className="text-xs text-fg-subtle mt-1">Use <code>{`{name}`}</code> for the site name, <code>{`{nav}`}</code> for the page navigation.</p>
                  </div>
                </div>
              )}
              {tab === "menu" && (
                <MenuEditor
                  menu={menu ?? editableMenu(storedMenu, menuPages.filter((p) => !leftOutOfMenu(p)))}
                  onChange={setMenu}
                  pages={menuPages.filter((p) => !leftOutOfMenu(p))}
                  siteSlug={site.slug}
                />
              )}
              {tab === "footer" && (
                <div className="space-y-4">
                  <FooterEditor design={footer} onChange={setFooter} pages={menuPages} siteSlug={site.slug} />
                  <div className="pt-3 border-t border-bg-border">
                    <Label>Custom footer HTML (replaces everything above)</Label>
                    <Textarea rows={4} value={footerHtml} onChange={(e) => setFooterHtml(e.target.value)} placeholder="Leave empty to use the footer above. Use HTML." />
                    <p className="text-xs text-fg-subtle mt-1">Use <code>{`{name}`}</code>, <code>{`{year}`}</code> and <code>{`{legal}`}</code> as placeholders.</p>
                  </div>
                </div>
              )}
              {tab === "seo" && (
                <div className="space-y-3">
                  <div><Label>Meta title (site default)</Label><Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="My Site" /></div>
                  <div><Label>Meta description</Label><Textarea rows={3} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="A description for search engines." /></div>
                  <div><Label>OG Image URL</Label><Input value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="https://…/og.png" /></div>
                  <div>
                    <Label>Favicon URL</Label>
                    <Input value={favicon} onChange={(e) => setFavicon(e.target.value)} placeholder="/uploads/icon.png" />
                    <p className="text-xs text-fg-subtle mt-1">The small icon in a browser tab. Upload one in a page&apos;s media library, then paste its address here.</p>
                  </div>
                  <div>
                    <Label>Language</Label>
                    <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" className="font-mono text-xs" />
                    <p className="text-xs text-fg-subtle mt-1">The language this site is written in, as a code like <code>en</code>, <code>de</code> or <code>pt-BR</code>. Screen readers and translation tools read it.</p>
                  </div>
                  <p className="text-xs text-fg-subtle pt-1">Every published page also carries a canonical address and appears in the site&apos;s <code>sitemap.xml</code>.</p>
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
              <Button variant="danger" onClick={() => setAsking(true)}>Delete site</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} loading={saving}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDelete
        open={asking}
        onClose={() => setAsking(false)}
        kind="site"
        name={site.name}
        costUrl={`/api/sites/${site.id}?cost=1`}
        backupUrl={`/api/sites/${site.id}/export`}
        onConfirm={destroy}
      />
    </>
  );
}
