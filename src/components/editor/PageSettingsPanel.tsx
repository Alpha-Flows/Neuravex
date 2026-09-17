"use client";
import { useState } from "react";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "./MediaPicker";

export interface PageSeo {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
}

interface Props {
  seo: PageSeo;
  onChange: (next: PageSeo) => void;
  /** Shown as the placeholder, since an empty field falls back to it. */
  fallbackTitle: string;
}

/**
 * Page-level settings shown in the inspector rail when no block is selected.
 *
 * These fields were already read when rendering a published page, but nothing
 * could set them: there was no UI and the page API dropped them on the floor.
 */
export function PageSettingsPanel({ seo, onChange, fallbackTitle }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (key: keyof PageSeo, value: string) => onChange({ ...seo, [key]: value });

  return (
    <div className="pb-5 mb-5 border-b border-bg-border">
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
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => { set("ogImage", url); setPickerOpen(false); }}
      />
    </div>
  );
}
