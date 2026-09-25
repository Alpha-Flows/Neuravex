"use client";
import { useState } from "react";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "./MediaPicker";
import { Toggle } from "./inspector-fields";
import { SaveAsTemplateButton } from "@/components/admin/SaveAsTemplateButton";
import { TranslationsPanel } from "./TranslationsPanel";
import type { TranslationState } from "@/lib/translations-store";

export interface PageSeo {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
}

/** What the page is for, beside its content: a blog post, or the site's "not found" page. */
export interface PageDetails {
  /** The page's language code, empty for the site's own. */
  language: string;
  isNotFound: boolean;
  isPost: boolean;
  /** `2026-09-25`, as the date field has it. */
  postDate: string;
  author: string;
  excerpt: string;
  coverImage: string;
  /** Comma-separated, as typed. */
  tags: string;
}

interface Props {
  seo: PageSeo;
  onChange: (next: PageSeo) => void;
  /** Shown as the placeholder, since an empty field falls back to it. */
  fallbackTitle: string;
  details: PageDetails;
  onDetailsChange: (next: PageDetails) => void;
  /** The home page cannot also be the page for addresses that find nothing. */
  isHome: boolean;
  /** For keeping the page as a template of one's own. */
  pageId: string;
  siteSlug: string;
  /** Addresses the page had before a rename, still forwarding to it. */
  formerSlugs: string[];
  onFormerSlugsChange: (next: string[]) => void;
  siteId: string;
  /** Null when the page could not be read, which leaves the section out. */
  translations: TranslationState | null;
}

/**
 * Page-level settings shown in the inspector rail when no block is selected.
 *
 * These fields were already read when rendering a published page, but nothing
 * could set them: there was no UI and the page API dropped them on the floor.
 */
export function PageSettingsPanel({
  seo,
  onChange,
  fallbackTitle,
  details,
  onDetailsChange,
  isHome,
  pageId,
  siteSlug,
  formerSlugs,
  onFormerSlugsChange,
  siteId,
  translations,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverPicking, setCoverPicking] = useState(false);
  const set = (key: keyof PageSeo, value: string) => onChange({ ...seo, [key]: value });
  const post = <K extends keyof PageDetails>(key: K, value: PageDetails[K]) => onDetailsChange({ ...details, [key]: value });

  return (
    <div className="pb-5 mb-5 border-b border-bg-border">
      <div className="mb-5 pb-5 border-b border-bg-border space-y-3" data-post-settings="">
        <Toggle
          label="This page is a blog post"
          checked={details.isPost}
          onChange={(isPost) =>
            onDetailsChange({ ...details, isPost, postDate: details.postDate || (isPost ? new Date().toISOString().slice(0, 10) : "") })
          }
          hint="A post is headed with its date, author, cover and tags, listed by the Blog posts block and in the site's feed, and kept out of the menu."
        />
        {details.isPost ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="post-date">Date</Label>
                <Input id="post-date" type="date" value={details.postDate} onChange={(e) => post("postDate", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="post-author">Author</Label>
                <Input id="post-author" value={details.author} maxLength={120} onChange={(e) => post("author", e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="post-excerpt">Summary</Label>
              <Textarea
                id="post-excerpt"
                rows={3}
                maxLength={400}
                value={details.excerpt}
                onChange={(e) => post("excerpt", e.target.value)}
                placeholder="A sentence or two for the list of posts and the feed."
              />
            </div>
            <div>
              <Label htmlFor="post-tags">Tags</Label>
              <Input id="post-tags" value={details.tags} onChange={(e) => post("tags", e.target.value)} placeholder="recipes, autumn" />
            </div>
            <div>
              <Label>Cover</Label>
              {details.coverImage ? (
                <div className="space-y-2">
                  <div className="rounded-md overflow-hidden border border-bg-border h-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={details.coverImage} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCoverPicking(true)} className="flex-1">Change</Button>
                    <Button size="sm" variant="ghost" onClick={() => post("coverImage", "")}>Remove</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setCoverPicking(true)} className="w-full">Choose a cover</Button>
              )}
            </div>
          </>
        ) : null}
      </div>
      <MediaPicker
        open={coverPicking}
        onClose={() => setCoverPicking(false)}
        onSelect={(url) => { post("coverImage", url); setCoverPicking(false); }}
      />
      {translations && !details.isNotFound ? (
        <TranslationsPanel
          pageId={pageId}
          siteId={siteId}
          initial={translations}
          language={details.language}
          onLanguageChange={(language) => post("language", language)}
        />
      ) : null}
      {isHome || details.isPost ? null : (
        <div className="mb-5 pb-5 border-b border-bg-border">
          <Toggle
            label="Show this page when an address finds nothing"
            checked={details.isNotFound}
            onChange={(isNotFound) => onDetailsChange({ ...details, isNotFound })}
            hint="The site's own 404 page, with its header and footer, instead of a plain message. It is kept out of the menu and the sitemap, goes into the download as 404.html, and is shown once published."
          />
        </div>
      )}
      {formerSlugs.length > 0 ? (
        <FormerAddresses pageId={pageId} siteSlug={siteSlug} slugs={formerSlugs} onChange={onFormerSlugsChange} />
      ) : null}
      <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold mb-3">Page SEO</div>
      <div className="space-y-3">
        <div>
          <Label>Search title</Label>
          <Input
            value={seo.metaTitle}
            onChange={(e) => set("metaTitle", e.target.value)}
            placeholder={fallbackTitle || "Page title"}
          />
        </div>
        <div>
          <Label>Search description</Label>
          <Textarea
            rows={3}
            value={seo.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
            placeholder="One or two sentences for search results."
          />
        </div>
        <div>
          <Label>Social image</Label>
          {seo.ogImage ? (
            <div className="space-y-2">
              <div className="rounded-md overflow-hidden border border-bg-border h-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seo.ogImage} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="flex-1">Change</Button>
                <Button size="sm" variant="ghost" onClick={() => set("ogImage", "")}>Remove</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="w-full">Choose image</Button>
          )}
        </div>
        <p className="text-xs text-fg-subtle">
          Anything left empty falls back to the site defaults in Settings → SEO.
        </p>
      </div>
      <div className="mt-5 pt-5 border-t border-bg-border space-y-1.5">
        <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold">Use again</div>
        <SaveAsTemplateButton pageId={pageId} defaultName={fallbackTitle || "Page"} label="Save page as template" />
        <p className="text-xs text-fg-subtle">Offered under &quot;Start from&quot; when you add a page to any site. Saves what was last saved.</p>
      </div>
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => { set("ogImage", url); setPickerOpen(false); }}
      />
    </div>
  );
}

/**
 * The addresses this page had before it was renamed, each still sending
 * visitors here, and a way to stop one. Listed only once there is one, which
 * is after a published page has been renamed.
 */
function FormerAddresses({
  pageId,
  siteSlug,
  slugs,
  onChange,
}: {
  pageId: string;
  siteSlug: string;
  slugs: string[];
  onChange: (next: string[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function stop(from: string) {
    setBusy(from);
    try {
      const res = await fetch(`/api/pages/${pageId}/redirects`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && Array.isArray(body?.formerSlugs)) onChange(body.formerSlugs);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-5 pb-5 border-b border-bg-border space-y-2" data-former-addresses="">
      <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold">Old addresses</div>
      <ul className="space-y-1">
        {slugs.map((from) => (
          <li key={from} className="flex items-center gap-2 text-xs">
            <code className="flex-1 min-w-0 truncate text-fg-muted" title={`/sites/${siteSlug}/${from}`}>/{from}</code>
            <span className="text-fg-subtle shrink-0">forwards here</span>
            <button
              type="button"
              onClick={() => stop(from)}
              disabled={busy === from}
              aria-label={`Stop forwarding /${from}`}
              className="shrink-0 w-6 h-6 rounded text-fg-muted hover:text-fg hover:bg-bg-card disabled:opacity-40"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-subtle">
        Links inside the site moved with the page. These catch the ones outside it — bookmarks, search results,
        other sites — and the download leaves a small page at each that sends visitors on.
      </p>
    </div>
  );
}
