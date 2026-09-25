"use client";
import { Input, Label } from "@/components/ui/Input";
import { PALETTE_SIZE, cleanHex } from "@/lib/palette";
import { TEXT_STYLE_DEFAULTS, TEXT_STYLE_KEYS, TEXT_STYLE_LIMITS, type TextStyleKey, type TextStyles } from "@/lib/text-styles";

/**
 * The site's palette: six slots, each a colour or empty.
 *
 * A slot keeps its number when the one before it is emptied, because blocks
 * refer to a slot by its number; see `lib/palette.ts`.
 */
export function PaletteEditor({ palette, onChange }: { palette: string[]; onChange: (next: string[]) => void }) {
  const slots = Array.from({ length: PALETTE_SIZE }, (_, i) => palette[i] ?? "");
  const set = (slot: number, value: string) => {
    const next = [...slots];
    next[slot] = value;
    onChange(next);
  };

  return (
    <div>
      <Label>Site colours</Label>
      <div className="grid grid-cols-2 gap-2">
        {slots.map((hex, slot) => {
          const name = `Site colour ${slot + 1}`;
          return hex === "" ? (
            <button
              key={slot}
              type="button"
              onClick={() => set(slot, "#94a3b8")}
              className="h-9 rounded-md border border-dashed border-bg-border text-xs text-fg-muted hover:text-fg hover:border-fg-subtle"
            >
              Add colour {slot + 1}
            </button>
          ) : (
            <div key={slot} className="flex items-center gap-1.5">
              <input
                type="color"
                aria-label={name}
                value={cleanHex(hex) || "#94a3b8"}
                onChange={(e) => set(slot, e.target.value)}
                className="w-9 h-9 shrink-0 rounded-md bg-transparent border border-bg-border"
              />
              <Input
                aria-label={`${name}, as hex`}
                value={hex}
                onChange={(e) => set(slot, e.target.value)}
                onBlur={() => set(slot, cleanHex(hex) || "#94a3b8")}
                className="h-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => set(slot, "")}
                aria-label={`Take away ${name.toLowerCase()}`}
                className="w-7 h-9 shrink-0 text-fg-muted hover:text-fg"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-fg-subtle mt-1.5">
        Offered beside the accent in every colour field. A block given one of these follows it when you change it
        here; one taken away leaves those blocks in the colour it last was.
      </p>
    </div>
  );
}

const TEXT_STYLE_LABEL: Record<TextStyleKey, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  body: "Body text",
};

/**
 * The site's text sizes. Empty means the size the blocks have always had,
 * which is shown as the placeholder so there is something to start from.
 */
export function TextSizeFields({ styles, onChange }: { styles: TextStyles; onChange: (next: TextStyles) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>Text sizes</Label>
        {Object.keys(styles).length > 0 ? (
          <button type="button" onClick={() => onChange({})} className="text-[11px] text-fg-muted hover:text-fg mb-1.5">
            Back to the defaults
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {TEXT_STYLE_KEYS.map((key) => {
          const [min, max] = TEXT_STYLE_LIMITS[key];
          return (
            <label key={key} className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span className="w-20 shrink-0">{TEXT_STYLE_LABEL[key]}</span>
              <Input
                type="number"
                aria-label={TEXT_STYLE_LABEL[key]}
                min={min}
                max={max}
                value={styles[key] ?? ""}
                placeholder={String(TEXT_STYLE_DEFAULTS[key])}
                onChange={(e) => {
                  const next = { ...styles };
                  const n = e.target.value === "" ? NaN : Number(e.target.value);
                  if (Number.isFinite(n)) next[key] = n;
                  else delete next[key];
                  onChange(next);
                }}
                className="h-8 text-sm"
              />
              <span className="text-fg-subtle">px</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-fg-subtle mt-1.5">
        Every heading is drawn at the size for its level, or for the level its own Size names, and text blocks
        scale from the body size by their Small to X-Large. On a narrow window a heading is four fifths of this.
      </p>
    </div>
  );
}
