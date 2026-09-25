"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cssFontStack } from "@/lib/css-value";
import {
  BUNDLED_FONTS,
  FONT_WEIGHTS,
  MAX_CUSTOM_FONTS,
  cleanFamilyName,
  familyOf,
  fontStack,
  guessFontFile,
  normalizeCustomFonts,
  type CustomFont,
  type FontCategory,
} from "@/lib/fonts";
import { sendUpload } from "@/lib/send-upload";

const CATEGORY_LABEL: Record<FontCategory, string> = {
  sans: "Sans serif",
  serif: "Serif",
  display: "Display",
  mono: "Monospace",
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as FontCategory[];

/** The faces already handed to the document, so a second picker adds none again. */
const registered = new Set<string>();

/**
 * Every font on offer, loaded into the settings page so each one's name can be
 * shown in it.
 *
 * Through the FontFace API rather than a `<style>` of `@font-face` rules: the
 * builder's policy lets a `<style>` element in only with the request's nonce,
 * which a panel opened long after the page arrived does not have, so every
 * preview would be drawn in the builder's own font. A face added this way is
 * governed by `font-src` alone, which allows the builder's own files. The
 * browser fetches each file only when a name is drawn in it — only the Latin
 * upright is needed for that.
 */
function usePreviewFaces(custom: CustomFont[]) {
  useEffect(() => {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return;
    const faces: { key: string; family: string; src: string; weight: string; style: string }[] = [
      ...BUNDLED_FONTS.map((f) => ({
        key: `bundled:${f.id}`,
        family: f.family,
        src: `url("/fonts/${f.id}/latin-normal.woff2") format("woff2")`,
        weight: f.weight,
        style: "normal",
      })),
      ...custom.map((f) => ({ key: `own:${f.url}`, family: f.family, src: `url("${f.url}")`, weight: f.weight, style: f.style })),
    ];
    for (const face of faces) {
      if (registered.has(face.key)) continue;
      registered.add(face.key);
      try {
        document.fonts.add(new FontFace(face.family, face.src, { weight: face.weight, style: face.style, display: "swap" }));
      } catch {
        // A face the browser will not take is a name drawn in the fallback.
      }
    }
  }, [custom]);
}

/** The distinct families among the site's own files, each with its kind. */
function ownFamilies(custom: CustomFont[]): { family: string; category: FontCategory }[] {
  const seen = new Map<string, FontCategory>();
  for (const f of custom) if (!seen.has(f.family)) seen.set(f.family, f.category);
  return [...seen].map(([family, category]) => ({ family, category }));
}

function Choice({
  family,
  stack,
  selected,
  onPick,
}: {
  family: string;
  stack: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      style={{ fontFamily: cssFontStack(stack) }}
      className={`h-9 px-2.5 rounded-md text-left text-[15px] truncate border ${
        selected ? "border-brand bg-brand/15 text-fg" : "border-bg-border text-fg-muted hover:text-fg hover:bg-bg-card"
      }`}
    >
      {family}
    </button>
  );
}

/**
 * One of the site's two fonts, picked by seeing it.
 *
 * It was a box of free text written into `font-family`, and what most people
 * typed was the name of a font they liked — which showed on their own
 * computer, where it was installed, and nowhere else. The bundled fonts and
 * the site's own files come first here, each shown in itself. Typing a stack
 * is still there, for a font every computer has, and a stack typed before
 * this is shown as it is rather than silently replaced.
 */
export function FontPicker({
  label,
  value,
  onChange,
  custom,
  unsetLabel,
}: {
  label: string;
  value: string;
  onChange: (stack: string) => void;
  custom: CustomFont[];
  /** What an empty value means for this field. */
  unsetLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const id = useId();
  usePreviewFaces(custom);

  const family = familyOf(value).toLowerCase();
  const bundled = BUNDLED_FONTS.find((f) => f.family.toLowerCase() === family);
  const own = ownFamilies(custom).find((f) => f.family.toLowerCase() === family);
  const known = !value || bundled || own;
  const shown = !value ? unsetLabel : bundled?.family ?? own?.family ?? value;
  const pick = (stack: string) => {
    onChange(stack);
    setTyping(false);
    setOpen(false);
  };

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-label={`${label}: ${shown}`}
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-full px-3 rounded-md bg-bg border border-bg-border text-left text-fg flex items-center justify-between gap-2 hover:border-fg-subtle"
      >
        <span className="truncate" style={value ? { fontFamily: cssFontStack(value) } : undefined}>
          {shown}
        </span>
        <span aria-hidden className="text-fg-subtle text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="mt-2 rounded-md border border-bg-border bg-bg p-2.5 space-y-3" role="group" aria-label={`${label} choices`}>
          <div className="grid grid-cols-2 gap-1.5">
            <Choice family={unsetLabel} stack="" selected={!value} onPick={() => pick("")} />
          </div>
          {CATEGORIES.map((category) => {
            const fonts = BUNDLED_FONTS.filter((f) => f.category === category);
            if (fonts.length === 0) return null;
            return (
              <div key={category}>
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle mb-1">{CATEGORY_LABEL[category]}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {fonts.map((f) => {
                    const stack = fontStack(f.family, f.category);
                    return <Choice key={f.id} family={f.family} stack={stack} selected={bundled?.id === f.id} onPick={() => pick(stack)} />;
                  })}
                </div>
              </div>
            );
          })}
          {custom.length > 0 ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle mb-1">Your fonts</div>
              <div className="grid grid-cols-2 gap-1.5">
                {ownFamilies(custom).map((f) => {
                  const stack = fontStack(f.family, f.category);
                  return (
                    <Choice key={f.family} family={f.family} stack={stack} selected={own?.family === f.family} onPick={() => pick(stack)} />
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="pt-2 border-t border-bg-border">
            {typing || !known ? (
              <div>
                <Input
                  aria-label={`${label}, typed`}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="Georgia, serif"
                  className="h-8 text-sm"
                />
                <p className="text-xs text-fg-subtle mt-1">
                  A font every computer already has, such as Georgia, Arial or Verdana. Anything else shows only
                  where it happens to be installed.
                </p>
              </div>
            ) : (
              <button type="button" onClick={() => setTyping(true)} className="text-xs text-fg-muted hover:text-fg">
                Type a font name instead
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A font file just uploaded, waiting to be named. */
interface Pending {
  url: string;
  family: string;
  weight: string;
  style: "normal" | "italic";
  category: FontCategory;
}

/**
 * The site's own font files: add one from disk and name it, or take one away.
 *
 * A file becomes a family the moment it has a name, and then it is offered in
 * both pickers above. Two files under one name — a regular and a bold — are
 * one family with two weights, the way a foundry ships them.
 */
export function SiteFontFiles({
  fonts,
  onChange,
}: {
  fonts: CustomFont[];
  onChange: (next: CustomFont[]) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      const result = await sendUpload(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const guess = guessFontFile(file.name);
      setPending({ url: result.url, ...guess, category: "sans" });
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!pending) return;
    const family = cleanFamilyName(pending.family);
    if (!family) {
      setError(
        "A name of plain letters, digits, spaces and dashes, and not one of the fonts Neuravex already has.",
      );
      return;
    }
    const next = normalizeCustomFonts([...fonts, { ...pending, family }]);
    if (next.length === fonts.length) {
      setError(
        fonts.length >= MAX_CUSTOM_FONTS
          ? `A site can hold ${MAX_CUSTOM_FONTS} font files. Take one away to add another.`
          : "There is already a file under that name at that weight and style.",
      );
      return;
    }
    onChange(next);
    setPending(null);
    setError("");
  }

  const describe = (f: CustomFont) =>
    `${FONT_WEIGHTS.find((w) => w.value === f.weight)?.label ?? f.weight}${f.style === "italic" ? " italic" : ""}`;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-fg-muted uppercase tracking-wide">Your font files</div>
      {fonts.length > 0 ? (
        <ul className="space-y-1">
          {fonts.map((f) => (
            <li key={`${f.family}|${f.weight}|${f.style}`} className="flex items-center gap-2 text-sm">
              <span className="truncate" style={{
                  fontFamily: cssFontStack(fontStack(f.family, f.category)),
                  fontWeight: f.weight.includes(" ") ? 400 : Number(f.weight),
                  fontStyle: f.style,
                }}>
                {f.family}
              </span>
              <span className="text-xs text-fg-subtle">{describe(f)}</span>
              <button
                type="button"
                onClick={() => onChange(fonts.filter((x) => x !== f))}
                aria-label={`Take away ${f.family} ${describe(f)}`}
                className="ml-auto text-xs text-fg-muted hover:text-fg"
              >
                Take away
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">
          A .woff2, .woff, .ttf or .otf file of a font you have a licence to put on a website.
        </p>
      )}

      {pending ? (
        <div className="rounded-md border border-bg-border p-2.5 space-y-2">
          <div>
            <Label htmlFor="nvx-font-name">Name</Label>
            <Input
              id="nvx-font-name"
              value={pending.family}
              onChange={(e) => setPending({ ...pending, family: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-fg-muted">
              Kind
              <select
                value={pending.category}
                onChange={(e) => setPending({ ...pending, category: e.target.value as FontCategory })}
                className="mt-1 h-8 w-full rounded-md bg-bg border border-bg-border text-fg text-sm px-1.5"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-fg-muted">
              Weight
              <select
                value={pending.weight}
                onChange={(e) => setPending({ ...pending, weight: e.target.value })}
                className="mt-1 h-8 w-full rounded-md bg-bg border border-bg-border text-fg text-sm px-1.5"
              >
                {FONT_WEIGHTS.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-fg-muted">
              Style
              <select
                value={pending.style}
                onChange={(e) => setPending({ ...pending, style: e.target.value === "italic" ? "italic" : "normal" })}
                className="mt-1 h-8 w-full rounded-md bg-bg border border-bg-border text-fg text-sm px-1.5"
              >
                <option value="normal">Upright</option>
                <option value="italic">Italic</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={add}>Add font</Button>
            <Button size="sm" variant="ghost" onClick={() => { setPending(null); setError(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            aria-label="Font file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button size="sm" variant="outline" loading={busy} onClick={() => input.current?.click()}>
            Add a font file
          </Button>
        </>
      )}
      {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
