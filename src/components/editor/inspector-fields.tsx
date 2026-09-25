"use client";
import { useState } from "react";
import type { BaseBlock } from "@/types";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "./MediaPicker";
import { isInternalLink, pagePath, targetOf, type LinkTarget } from "@/lib/page-links";

/**
 * The controls every block's panel is built from.
 *
 * These lived at the bottom of `BlockInspector.tsx`, which was fine while
 * every block's panel was a case in one switch there. Ten more blocks would
 * have made that one file two thousand lines long, so a block with a panel of
 * any size now has a file of its own under `inspectors/`, and the pieces they
 * share are here — one colour field, one link field, one list editor, rather
 * than a copy of each per block drifting apart.
 */

/** What a block's own panel is handed. */
export interface BlockPanelProps {
  block: BaseBlock;
  onChange: (next: BaseBlock) => void;
  /** Every page of this site, so a link can be picked instead of typed. */
  linkTargets?: LinkTarget[];
  siteSlug?: string;
}

export const OVERLAY_PRESETS = [
  { value: "", label: "None" },
  { value: "rgba(0,0,0,0.25)", label: "Dark — light" },
  { value: "rgba(0,0,0,0.45)", label: "Dark — medium" },
  { value: "rgba(0,0,0,0.65)", label: "Dark — heavy" },
  { value: "rgba(255,255,255,0.5)", label: "Light tint" },
];

export function BackgroundImageField({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {value ? (
        <div className="space-y-2">
          <div className="rounded-md overflow-hidden border border-bg-border h-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="flex-1">Change</Button>
            <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>Remove</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="w-full">Choose image</Button>
      )}
      <MediaPicker open={open} onClose={() => setOpen(false)} onSelect={(url) => { onChange(url); setOpen(false); }} />
    </>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:border-brand/60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function SegBtns<T extends string>({
  value,
  options,
  onChange,
  nameFor,
  labelFor,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  /**
   * What the button is called when the label alone does not say — a bare "2"
   * means nothing read out on its own, and there is more than one row of
   * numbers in the columns inspector.
   */
  nameFor?: (v: T) => string;
  /**
   * What the button shows, when the stored value is not a word a person
   * would pick — "sm" reads better as "S", and "embed" as "Live map". Left
   * out, the value is shown as it is, capitalised.
   */
  labelFor?: (v: T) => string;
}) {
  return (
    <div className="inline-flex rounded-md border border-bg-border overflow-hidden w-full">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-label={nameFor ? nameFor(o) : undefined}
          aria-pressed={value === o}
          className={`flex-1 h-8 text-xs ${labelFor ? "" : "capitalize"} ${value === o ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card"}`}
        >
          {labelFor ? labelFor(o) : o.replace("/", " / ")}
        </button>
      ))}
    </div>
  );
}

export function ColorInput({
  value,
  onChange,
  allowTransparent,
  inherit,
}: {
  value: string;
  onChange: (v: string) => void;
  allowTransparent?: boolean;
  /**
   * What an empty value means — "Site accent", say. Shown as a button that
   * hands the colour back to the site's branding. Without this there is no way
   * back: pick a colour once and the block is pinned to that hex forever, which
   * is how a brand colour ends up needing a visit to every button on every page.
   */
  inherit?: string;
}) {
  const isTransparent = value === "transparent" || value === "rgba(0,0,0,0)";
  const inheriting = inherit != null && value === "";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isTransparent || inheriting ? "#ffffff" : value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-md bg-transparent border border-bg-border"
        />
        <Input
          value={value}
          placeholder={inherit}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono text-xs"
        />
        {allowTransparent ? (
          <button
            onClick={() => onChange("transparent")}
            className={`h-9 px-2 rounded-md text-xs border ${isTransparent ? "bg-brand text-white border-brand" : "border-bg-border text-fg-muted hover:text-fg"}`}
          >
            None
          </button>
        ) : null}
      </div>
      {inherit ? (
        <button
          onClick={() => onChange("")}
          aria-pressed={inheriting}
          className={`h-7 w-full rounded-md text-xs border ${
            inheriting
              ? "bg-brand/15 text-brand border-brand/40"
              : "border-bg-border text-fg-muted hover:text-fg hover:bg-bg-card"
          }`}
        >
          {inheriting ? `Using ${inherit.toLowerCase()}` : `Use ${inherit.toLowerCase()}`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Where a link goes.
 *
 * This was a bare text box, and the only way to link to your own Contact page
 * was to remember that it lives at `/sites/<site>/contact` and type it without
 * a slip — in a field that would not have told you either way. The pages of
 * the site are listed now, drafts included, and picking one writes the address
 * the server actually stores. An address typed by hand still works, and a path
 * into this site that matches no page says so instead of waiting to be found
 * by a visitor.
 */
export function LinkField({
  value,
  onChange,
  pages,
  siteSlug,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  pages?: LinkTarget[];
  siteSlug?: string;
  /**
   * What the field is called, where there is no visible label beside it — a
   * link inside one row of a list, say. The page menu is named after it.
   */
  ariaLabel?: string;
}) {
  const href = value ?? "";
  const target = pages && siteSlug ? targetOf(href, siteSlug, pages) : null;
  const internal = siteSlug ? isInternalLink(href, siteSlug) : false;
  const broken = internal && !target;

  return (
    <div className="space-y-1.5">
      <Input
        value={href}
        placeholder="https://example.com, /sites/…, #anchor or mailto:"
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      />
      {pages && siteSlug && pages.length > 0 ? (
        <select
          // The value is never the current href when the link points outside
          // the site, so the select shows its own first option rather than
          // claiming the link goes to a page it does not.
          value={target ? target.slug : ""}
          aria-label={ariaLabel ? `${ariaLabel}: a page in this site` : undefined}
          onChange={(e) => {
            const page = pages.find((p) => p.slug === e.target.value);
            if (page) onChange(pagePath(siteSlug, page.slug, page.isHome));
          }}
          className="h-9 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <option value="">Link to a page in this site…</option>
          {pages.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
              {p.isHome ? " (home)" : ""}
              {p.published ? "" : " — draft"}
            </option>
          ))}
        </select>
      ) : null}
      {broken ? (
        <p className="text-xs text-amber-400">No page of this site is at that address — this link will 404.</p>
      ) : target && !target.published ? (
        <p className="text-xs text-fg-subtle">{target.title} is a draft, so visitors get a 404 until it is published.</p>
      ) : null}
    </div>
  );
}

/**
 * A yes-or-no setting, as a checkbox with its label beside it.
 *
 * A labelled checkbox rather than a two-button "On / Off" row: the label is
 * the question, so it reads as one line, and a screen reader announces it as
 * the setting it is.
 */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-fg cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-bg-border accent-brand"
        />
        {label}
      </label>
      {hint ? <p className="text-[11px] text-fg-subtle mt-1 ml-6">{hint}</p> : null}
    </div>
  );
}

/**
 * A list somebody builds up a row at a time — questions, plans, pictures.
 *
 * The list and form panels each grew their own add-and-remove rows, with no
 * way to change the order short of deleting a row and typing it again at the
 * end. Every block that keeps a list uses this one instead, so each of them
 * can be reordered, and each row names what it is for the buttons a screen
 * reader reads out: "Move Question 2 up", not "↑".
 */
export function ListEditor<T>({
  items,
  onChange,
  renderItem,
  newItem,
  onAdd,
  addLabel,
  itemLabel,
  max,
  min = 0,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  /** The fields for one row. `update` replaces that row. */
  renderItem: (item: T, update: (next: T) => void, index: number) => React.ReactNode;
  /** A fresh row, for the add button. Ignored when `onAdd` is given. */
  newItem?: () => T;
  /** Adds a row some other way — by opening the picture library, say. */
  onAdd?: () => void;
  addLabel: string;
  /** What a row is called: "Question 2", "Pro". */
  itemLabel: (item: T, index: number) => string;
  max?: number;
  /** Rows that may not be removed below — a table needs one row to be a table. */
  min?: number;
}) {
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  }

  const full = max != null && items.length >= max;

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const name = itemLabel(item, i);
        return (
          <div key={i} className="rounded-md border border-bg-border bg-bg p-2 space-y-2">
            <div className="flex items-center gap-1">
              <span className="flex-1 min-w-0 truncate text-xs font-medium text-fg-muted">{name}</span>
              <button
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label={`Move ${name} up`}
                title="Move up"
                className="w-6 h-6 rounded text-xs text-fg-subtle hover:text-fg hover:bg-bg-card disabled:opacity-30 disabled:hover:bg-transparent"
              >↑</button>
              <button
                onClick={() => move(i, i + 1)}
                disabled={i === items.length - 1}
                aria-label={`Move ${name} down`}
                title="Move down"
                className="w-6 h-6 rounded text-xs text-fg-subtle hover:text-fg hover:bg-bg-card disabled:opacity-30 disabled:hover:bg-transparent"
              >↓</button>
              <button
                onClick={() => onChange(items.filter((_, k) => k !== i))}
                disabled={items.length <= min}
                aria-label={`Remove ${name}`}
                title="Remove"
                className="w-6 h-6 rounded text-sm text-fg-subtle hover:text-red-400 hover:bg-bg-card disabled:opacity-30 disabled:hover:bg-transparent"
              >×</button>
            </div>
            {renderItem(
              item,
              (next) => {
                const list = items.slice();
                list[i] = next;
                onChange(list);
              },
              i,
            )}
          </div>
        );
      })}
      {full ? (
        <p className="text-[11px] text-fg-subtle">That is as many as one block holds.</p>
      ) : (
        <button
          onClick={() => {
            if (onAdd) onAdd();
            else if (newItem) onChange([...items, newItem()]);
          }}
          className="text-xs text-fg-muted hover:text-fg"
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}
