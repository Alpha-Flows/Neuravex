"use client";
import type { BaseBlock, BlockBox } from "@/types";
import { Input } from "@/components/ui/Input";
import { BORDER_STYLES, BOX_MAX, SHADOW_NAMES, withBox, type ShadowName } from "@/lib/block-box";
import { ColorInput, Field, SegBtns, Select } from "./inspector-fields";

/** A length in px, typed as a number; empty means none. */
function Px({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number | undefined;
  max: number;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-fg-muted">
      <span className="w-14 shrink-0">{label}</span>
      <Input
        type="number"
        min={0}
        max={max}
        step={1}
        value={value ?? ""}
        placeholder="0"
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          onChange(n === undefined || !Number.isFinite(n) ? undefined : Math.min(Math.max(Math.round(n), 0), max));
        }}
        className="h-8 text-sm"
      />
      <span className="text-fg-subtle">px</span>
    </label>
  );
}

const SHADOW_LABEL: Record<ShadowName, string> = { none: "None", sm: "S", md: "M", lg: "L", xl: "XL" };

/**
 * The frame around any block: room inside and around it, a border, rounded
 * corners, a shadow and a fill.
 *
 * Beside Depth, for every type, because the frame belongs to the block rather
 * than to what the block is: the same five controls give a heading room to
 * breathe, put a quote in a box and lift a picture off the page — the three
 * things the templates were building out of Spacer blocks and one-block
 * sections.
 */
export function FramePanel({ block, onChange }: { block: BaseBlock; onChange: (next: BaseBlock) => void }) {
  const box: BlockBox = block.box ?? {};
  const set = (patch: Partial<BlockBox>) => onChange(withBox(block, patch));
  const bordered = (box.borderWidth ?? 0) > 0;

  return (
    <div className="pt-4 border-t border-bg-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-semibold">Frame</div>
        {block.box ? (
          <button
            type="button"
            onClick={() => {
              const { box: _dropped, ...rest } = block;
              onChange(rest);
            }}
            className="text-[11px] text-fg-muted hover:text-fg"
          >
            Clear
          </button>
        ) : null}
      </div>

      <Field label="Room inside">
        <div className="space-y-1.5">
          <Px label="Top, bottom" value={box.paddingY} max={BOX_MAX.padding} onChange={(paddingY) => set({ paddingY })} />
          <Px label="Sides" value={box.paddingX} max={BOX_MAX.padding} onChange={(paddingX) => set({ paddingX })} />
        </div>
      </Field>

      <Field label="Room around">
        <div className="space-y-1.5">
          <Px label="Above" value={box.marginTop} max={BOX_MAX.margin} onChange={(marginTop) => set({ marginTop })} />
          <Px label="Below" value={box.marginBottom} max={BOX_MAX.margin} onChange={(marginBottom) => set({ marginBottom })} />
        </div>
      </Field>

      <Field label="Border">
        <div className="space-y-1.5">
          <Px label="Width" value={box.borderWidth} max={BOX_MAX.borderWidth} onChange={(borderWidth) => set({ borderWidth })} />
          {bordered ? (
            <>
              <Select
                value={box.borderStyle ?? "solid"}
                onChange={(v) => set({ borderStyle: v === "solid" ? undefined : (v as BlockBox["borderStyle"]) })}
                options={BORDER_STYLES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
              />
              <ColorInput value={box.borderColor ?? ""} onChange={(borderColor) => set({ borderColor })} inherit="Text colour, faded" />
            </>
          ) : null}
        </div>
      </Field>

      <Field label="Corners">
        <Px label="Radius" value={box.radius} max={BOX_MAX.radius} onChange={(radius) => set({ radius })} />
      </Field>

      <Field label="Shadow">
        <SegBtns<ShadowName>
          value={box.shadow ?? "none"}
          options={SHADOW_NAMES}
          onChange={(shadow) => set({ shadow: shadow === "none" ? undefined : shadow })}
          labelFor={(v) => SHADOW_LABEL[v]}
          nameFor={(v) => (v === "none" ? "No shadow" : `Shadow ${SHADOW_LABEL[v]}`)}
        />
      </Field>

      <Field label="Fill">
        <ColorInput value={box.background ?? ""} onChange={(background) => set({ background })} inherit="None" allowTransparent />
      </Field>
    </div>
  );
}
