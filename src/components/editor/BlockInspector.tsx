"use client";
import { useEffect, useState } from "react";
import { BaseBlock, BlockLayer, HeadingProps, TextProps, ImageProps, ButtonProps, DividerProps, SpacerProps, SectionProps, ColumnsProps, ColumnStyle, QuoteProps, ListProps, HtmlProps, PostsProps } from "@/types";
import { clampColumnCount } from "@/lib/tree-utils";
import { clampLevel, layerOf, MAX_LEVEL, MIN_LEVEL, withLayer } from "@/lib/block-layer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getBlockDefinition } from "@/lib/blocks";
import type { LinkTarget } from "@/lib/page-links";
import { BackgroundFill, BackgroundImageField, ColorInput, Field, FocusPicker, LinkField, OVERLAY_PRESETS, SegBtns, Select, Toggle } from "./inspector-fields";
import { IMAGE_SHAPES } from "@/lib/focus-point";
import { GalleryPanel } from "./inspectors/GalleryPanel";
import { AccordionPanel } from "./inspectors/AccordionPanel";
import { SliderPanel } from "./inspectors/SliderPanel";
import { AudioPanel } from "./inspectors/AudioPanel";
import { IconPanel } from "./inspectors/IconPanel";
import { SocialPanel } from "./inspectors/SocialPanel";
import { TablePanel } from "./inspectors/TablePanel";
import { PricingPanel } from "./inspectors/PricingPanel";
import { MapPanel } from "./inspectors/MapPanel";
import { CodePanel } from "./inspectors/CodePanel";
import { FormPanel } from "./inspectors/FormPanel";
import { FramePanel } from "./FramePanel";
import { MotionPanel } from "./MotionPanel";
import { usePageAnchors } from "./page-anchors";
import { MAX_ANCHOR, anchorHref, cleanAnchor } from "@/lib/anchors";
import { VideoPanel } from "./inspectors/VideoPanel";
import type { ContainerChoice } from "@/lib/containers";

interface Placement {
  /** Zero-based column this block currently sits in. */
  current: number;
  count: number;
  onMove: (column: number) => void;
}

/**
 * Where a floating block floats, and where else it could.
 *
 * Only floats need this. Every other block is moved by dragging it, but a
 * float's drag already means "move it across the page" — see
 * `src/lib/containers.ts` for why that left it stuck in one container.
 */
interface ContainerPlacement {
  /** The container id the block is in now. */
  current: string;
  choices: ContainerChoice[];
  onMove: (containerId: string) => void;
}

interface Props {
  block: BaseBlock | null;
  onChange: (next: BaseBlock) => void;
  onClose: () => void;
  /** Set when the block is a child of a columns block. */
  placement?: Placement;
  /**
   * The highest and lowest level among the blocks this one shares a container
   * with, so "bring to front" can mean in front of *these* rather than a
   * number somebody has to guess.
   */
  levels?: { min: number; max: number };
  /** Where a floating block sits, and the other containers it could sit in. */
  containers?: ContainerPlacement;
  /** Keeps this block, under a name, for use on any page. */
  onSaveForReuse?: (name: string, synced: boolean) => Promise<void> | void;
  /** Every page of this site, so a link can be picked instead of typed. */
  linkTargets?: LinkTarget[];
  siteSlug?: string;
}

export function BlockInspector({ block, onChange, onClose, placement, levels, containers, onSaveForReuse, linkTargets, siteSlug }: Props) {
  if (!block) {
    return (
      <aside data-inspector="" className="w-72 shrink-0 border-l border-bg-border bg-bg-soft h-full p-4 text-sm text-fg-muted">
        <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold mb-3">Inspector</div>
        <div className="rounded-lg border border-dashed border-bg-border p-6 text-center">
          <div className="text-2xl mb-1">←</div>
          Click a block on the page to edit its properties.
        </div>
      </aside>
    );
  }

  return (
    <aside data-inspector="" className="w-72 shrink-0 border-l border-bg-border bg-bg-soft h-full overflow-y-auto">
      <div className="p-4 border-b border-bg-border sticky top-0 bg-bg-soft z-10 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-fg-subtle">Editing</div>
          <div className="text-sm font-semibold capitalize">{block.type}</div>
        </div>
        <button onClick={onClose} className="text-fg-muted hover:text-fg text-sm">×</button>
      </div>
      <div className="p-4 space-y-4">
        {placement ? <ColumnPlacement placement={placement} /> : null}
        <InspectorBody block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />
        <FramePanel block={block} onChange={onChange} />
        <MotionPanel block={block} onChange={onChange} />
        <DepthPanel block={block} onChange={onChange} levels={levels ?? { min: 0, max: 0 }} containers={containers} />
        {block.synced ? <SyncedNote block={block} onChange={onChange} /> : null}
        {onSaveForReuse && !block.synced ? <SaveForReuse block={block} onSave={onSaveForReuse} /> : null}
      </div>
    </aside>
  );
}

/**
 * Keeping a block to use again.
 *
 * A section built once had to be rebuilt by hand on the next page. Named here,
 * it shows up in the palette on every page of every site.
 */
/**
 * What a synced copy is, said where it is being edited, with the way out.
 *
 * Its name is fetched rather than carried on the block: the block holds only
 * the saved block's id, which is all a page needs, and the name can change.
 */
function SyncedNote({ block, onChange }: { block: BaseBlock; onChange: (next: BaseBlock) => void }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/saved-blocks")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; name: string }[]) => {
        if (live) setName(Array.isArray(rows) ? rows.find((r) => r.id === block.synced)?.name ?? null : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [block.synced]);

  return (
    <div className="pt-4 border-t border-bg-border space-y-2" data-synced-note="">
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-semibold">⟳ Synced block</div>
      <p className="text-xs text-fg-muted">
        {name ? <>This is &quot;{name}&quot;. </> : null}
        What you change here is written into every page that uses it when this page is saved.
      </p>
      <button
        type="button"
        onClick={() => {
          const { synced: _dropped, ...rest } = block;
          onChange(rest);
        }}
        className="w-full h-8 rounded-md border border-bg-border text-xs text-fg-muted hover:text-fg hover:border-brand/60"
      >
        Detach — make this copy its own
      </button>
    </div>
  );
}

function SaveForReuse({ block, onSave }: { block: BaseBlock; onSave: (name: string, synced: boolean) => Promise<void> | void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [synced, setSynced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function keep() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed, synced);
      setSaved(true);
      setNaming(false);
      setName("");
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!naming) {
    return (
      <div className="pt-4 border-t border-bg-border">
        <button
          onClick={() => { setNaming(true); setName(getBlockDefinition(block.type)?.label ?? block.type); }}
          className="w-full h-8 rounded-md border border-bg-border text-xs text-fg-muted hover:text-fg hover:border-brand/60"
        >
          {saved ? "Saved to the palette" : "Save for reuse"}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-bg-border space-y-2">
      <Label>Name it</Label>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") keep();
          if (e.key === "Escape") setNaming(false);
        }}
        placeholder="Pricing section"
        className="h-8 text-xs"
      />
      <Toggle
        label="Keep every copy the same"
        checked={synced}
        onChange={setSynced}
        hint="Change it on any page and every page that uses it changes when that page is saved. Off, each place it is put is a copy of its own."
      />
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={() => setNaming(false)} className="h-7 px-2.5 rounded-md text-xs text-fg-muted hover:text-fg">
          Cancel
        </button>
        <button
          onClick={keep}
          disabled={saving || !name.trim()}
          className="h-7 px-3 rounded-md text-xs font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ColumnPlacement({ placement }: { placement: Placement }) {
  return (
    <div className="pb-4 border-b border-bg-border">
      <Label>Column</Label>
      <div className="inline-flex rounded-md border border-bg-border overflow-hidden w-full">
        {Array.from({ length: placement.count }, (_, i) => (
          <button
            key={i}
            onClick={() => placement.onMove(i)}
            className={`flex-1 h-8 text-xs ${i === placement.current ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card"}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-subtle mt-1.5">
        Blocks stay in the column you pick. On phones the columns stack in this order.
      </p>
    </div>
  );
}

/**
 * Depth: what this block sits over, and whether it is lifted out of the flow
 * to sit over anything at all.
 *
 * Every block on a page used to be in one flat stack, so putting a caption on
 * a photograph was not something this builder could do — the caption pushed
 * the photograph down, and the photograph pushed the caption down. "Floating"
 * takes a block out of the flow: it stops taking room of its own, so nothing
 * around it moves, and it is placed over its neighbours by the three
 * percentages below or by dragging it on the canvas. "Level" then says which
 * of two overlapping blocks is in front, and works in the flow too — a
 * section's background can be made to run over the block above it without
 * anything floating at all.
 */
function DepthPanel({
  block,
  onChange,
  levels,
  containers,
}: {
  block: BaseBlock;
  onChange: (next: BaseBlock) => void;
  levels: { min: number; max: number };
  containers?: ContainerPlacement;
}) {
  const layer = layerOf(block);
  const floating = layer.mode === "float";
  const set = (patch: Partial<BlockLayer>) => onChange(withLayer(block, patch));

  return (
    <div className="pt-4 border-t border-bg-border space-y-3">
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-semibold">Depth</div>

      <Field label="Placement">
        <div className="inline-flex rounded-md border border-bg-border overflow-hidden w-full">
          {([
            { mode: "flow" as const, label: "In the flow" },
            { mode: "float" as const, label: "Floating" },
          ]).map((option) => (
            <button
              key={option.mode}
              onClick={() => set({ mode: option.mode })}
              aria-pressed={layer.mode === option.mode}
              className={`flex-1 h-8 text-xs ${
                layer.mode === option.mode ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Level">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => set({ level: clampLevel(layer.level - 1) })}
            disabled={layer.level <= MIN_LEVEL}
            aria-label="Send one level back"
            title="Send one level back"
            className="w-8 h-8 shrink-0 rounded-md border border-bg-border text-fg-muted hover:text-fg hover:bg-bg-card disabled:opacity-30"
          >
            –
          </button>
          <Input
            type="number"
            min={MIN_LEVEL}
            max={MAX_LEVEL}
            value={String(layer.level)}
            aria-label="Depth level"
            onChange={(e) => set({ level: clampLevel(Number(e.target.value)) })}
            className="h-8 text-xs text-center"
          />
          <button
            onClick={() => set({ level: clampLevel(layer.level + 1) })}
            disabled={layer.level >= MAX_LEVEL}
            aria-label="Bring one level forward"
            title="Bring one level forward"
            className="w-8 h-8 shrink-0 rounded-md border border-bg-border text-fg-muted hover:text-fg hover:bg-bg-card disabled:opacity-30"
          >
            +
          </button>
        </div>
      </Field>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => set({ level: clampLevel(levels.max + 1) })}
          className="flex-1 h-8 rounded-md border border-bg-border text-xs text-fg-muted hover:text-fg hover:border-brand/60"
        >
          Bring to front
        </button>
        <button
          onClick={() => set({ level: clampLevel(levels.min - 1) })}
          className="flex-1 h-8 rounded-md border border-bg-border text-xs text-fg-muted hover:text-fg hover:border-brand/60"
        >
          Send to back
        </button>
      </div>

      {floating ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <PercentField label="Left" value={layer.x} onChange={(v) => set({ x: v })} />
            <PercentField label="Top" value={layer.y} onChange={(v) => set({ y: v })} />
            <PercentField label="Width" value={layer.width} onChange={(v) => set({ width: v })} />
          </div>
          <p className="text-xs text-fg-subtle">
            Measured as a share of the area it floats in — the section, the column, or the page — so it stays in the
            same place on a phone as on a desktop. Drag the ✥ handle to move it, or the bar on its right edge to set
            how wide it is. The arrow keys nudge it whenever the caret is not in its own text.
          </p>
          {containers && containers.choices.length > 1 ? (
            <FloatsIn containers={containers} />
          ) : null}
        </>
      ) : (
        <p className="text-xs text-fg-subtle">
          In the flow, this block takes its own room and pushes the next one down. Set it floating to lay it over its
          neighbours instead — a headline on a photograph, a badge on a card.
        </p>
      )}
    </div>
  );
}

/**
 * Which container a floating block floats in.
 *
 * Dragging is how every other block changes container, and a float's drag is
 * already spoken for — it moves the block within whatever it floats in. So the
 * containers are listed by name instead. The list is indented the way the
 * outline is, because "Section 2" means little until you can see it sits
 * inside the first one.
 */
function FloatsIn({ containers }: { containers: ContainerPlacement }) {
  return (
    <div className="pt-1">
      <Label>Floats in</Label>
      <div className="rounded-md border border-bg-border overflow-hidden">
        {containers.choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => containers.onMove(choice.id)}
            aria-pressed={choice.id === containers.current}
            style={{ paddingLeft: 8 + choice.depth * 12 }}
            className={`w-full text-left pr-2 h-8 text-xs ${
              choice.id === containers.current
                ? "bg-brand text-white"
                : "text-fg-muted hover:text-fg hover:bg-bg-card"
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-subtle mt-1.5">
        It keeps its position, which is a share of whatever it floats in — so moving it to a narrower container
        makes it narrower too.
      </p>
    </div>
  );
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step={1}
          value={String(value)}
          aria-label={`${label} (percent)`}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className="h-8 text-xs pr-5"
        />
        <span aria-hidden className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle">%</span>
      </div>
    </div>
  );
}

function InspectorBody({
  block,
  onChange,
  linkTargets,
  siteSlug,
}: {
  block: BaseBlock;
  onChange: (next: BaseBlock) => void;
  linkTargets?: LinkTarget[];
  siteSlug?: string;
}) {
  const set = <K extends keyof any>(key: string, value: any) => onChange({ ...block, props: { ...block.props, [key]: value } });
  switch (block.type) {
    case "heading": {
      const p = block.props as HeadingProps;
      return (
        <>
          <Field label="Text"><Input value={p.text} onChange={(e) => set("text", e.target.value)} /></Field>
          <Field label="Level">
            <Select value={String(p.level)} onChange={(v) => set("level", Number(v) as any)} options={["1", "2", "3", "4"].map((v) => ({ value: v, label: `Heading ${v}` }))} />
          </Field>
          {/*
            The level is the outline; this is the size. They are the same
            thing until you say otherwise, which is what a page of prose
            needs — a section heading that is an h2 without being 48px.
          */}
          <Field label="Size">
            <Select
              value={String(p.size ?? "")}
              onChange={(v) => set("size", v ? (Number(v) as any) : undefined)}
              options={[
                { value: "", label: "Follows the level" },
                ...["1", "2", "3", "4"].map((v) => ({ value: v, label: `Size of heading ${v}` })),
              ]}
            />
          </Field>
          <Field label="Weight">
            <Select value={p.weight} onChange={(v) => set("weight", v)} options={[
              { value: "normal", label: "Normal" },
              { value: "medium", label: "Medium" },
              { value: "semibold", label: "Semibold" },
              { value: "bold", label: "Bold" },
            ]} />
          </Field>
          <Field label="Align">
            <SegBtns value={p.align} options={["left", "center", "right"]} onChange={(v) => set("align", v)} />
          </Field>
          <Field label="Color"><ColorInput value={p.color} onChange={(v) => set("color", v)} inherit="Page text colour" /></Field>
        </>
      );
    }
    case "text": {
      const p = block.props as TextProps;
      return (
        <>
          <Field label="Text">
            <Textarea rows={5} value={p.text} onChange={(e) => set("text", e.target.value)} />
          </Field>
          <Field label="Size">
            <Select value={p.size} onChange={(v) => set("size", v)} options={[
              { value: "sm", label: "Small" },
              { value: "base", label: "Medium" },
              { value: "lg", label: "Large" },
              { value: "xl", label: "X-Large" },
            ]} />
          </Field>
          <Field label="Align">
            <SegBtns value={p.align} options={["left", "center", "right", "justify"]} onChange={(v) => set("align", v)} />
          </Field>
          <Field label="Color"><ColorInput value={p.color} onChange={(v) => set("color", v)} inherit="Page text colour" /></Field>
        </>
      );
    }
    case "image": {
      const p = block.props as ImageProps;
      return (
        <>
          <Field label="Image URL"><Input value={p.src} onChange={(e) => set("src", e.target.value)} /></Field>
          <Field label="Alt text">
            <Input
              value={p.alt}
              onChange={(e) =>
                onChange({ ...block, props: { ...block.props, alt: e.target.value, altFromLibrary: false } })
              }
            />
          </Field>
          <Field label="Caption"><Input value={p.caption} onChange={(e) => set("caption", e.target.value)} /></Field>
          <Field label="Width">
            <Select value={p.width} onChange={(v) => set("width", v)} options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
              { value: "full", label: "Full" },
            ]} />
          </Field>
          <Field label="Rounded corners">
            <Select value={p.rounded} onChange={(v) => set("rounded", v)} options={[
              { value: "none", label: "None" },
              { value: "md", label: "Slight" },
              { value: "xl", label: "Rounded" },
              { value: "full", label: "Pill" },
            ]} />
          </Field>
          <Field label="Shape">
            <Select
              value={p.shape ?? "original"}
              onChange={(v) => set("shape", v === "original" ? undefined : v)}
              options={IMAGE_SHAPES.map((shape) => ({ value: shape.value, label: shape.label }))}
            />
          </Field>
          {p.src && p.shape && p.shape !== "original" ? (
            <Field label="Keep in view">
              <FocusPicker src={p.src} value={p.focus} onChange={(v) => set("focus", v)} />
            </Field>
          ) : null}
        </>
      );
    }
    case "button": {
      const p = block.props as ButtonProps;
      return (
        <>
          <Field label="Label"><Input value={p.label} onChange={(e) => set("label", e.target.value)} /></Field>
          <Field label="Link">
            <LinkField value={p.href} onChange={(v) => set("href", v)} pages={linkTargets} siteSlug={siteSlug} />
          </Field>
          <Field label="Style">
            <Select value={p.variant} onChange={(v) => set("variant", v)} options={[
              { value: "primary", label: "Primary" },
              { value: "secondary", label: "Secondary" },
              { value: "outline", label: "Outline" },
              { value: "ghost", label: "Ghost" },
            ]} />
          </Field>
          <Field label="Size">
            <Select value={p.size} onChange={(v) => set("size", v)} options={[
              { value: "sm", label: "Small" },
              { value: "md", label: "Medium" },
              { value: "lg", label: "Large" },
            ]} />
          </Field>
          <Field label="Align">
            <SegBtns value={p.align} options={["left", "center", "right"]} onChange={(v) => set("align", v)} />
          </Field>
          <Field label="Background"><ColorInput value={p.color} onChange={(v) => set("color", v)} inherit="Site accent" /></Field>
          <Field label="Text color"><ColorInput value={p.textColor} onChange={(v) => set("textColor", v)} inherit="Automatic" /></Field>
        </>
      );
    }
    case "divider": {
      const p = block.props as DividerProps;
      return (
        <>
          <Field label="Style">
            <SegBtns value={p.style} options={["solid", "dashed", "dotted"]} onChange={(v) => set("style", v)} />
          </Field>
          <Field label="Color"><ColorInput value={p.color} onChange={(v) => set("color", v)} inherit="Site default" /></Field>
          <Field label="Thickness (px)"><Input type="number" value={p.thickness} onChange={(e) => set("thickness", Number(e.target.value))} /></Field>
        </>
      );
    }
    case "spacer": {
      const p = block.props as SpacerProps;
      return <Field label="Height (px)"><Input type="number" value={p.height} onChange={(e) => set("height", Number(e.target.value))} /></Field>;
    }
    case "section": {
      const p = block.props as SectionProps;
      return (
        <>
          <SectionNameField blockId={block.id} value={p.anchor ?? ""} onChange={(v) => set("anchor", v || undefined)} />
          <Field label="Background image">
            <BackgroundImageField value={p.backgroundImage} onChange={(v) => set("backgroundImage", v)} />
          </Field>
          {p.backgroundImage ? (
            <Field label="Keep in view">
              <FocusPicker src={p.backgroundImage} value={p.backgroundFocus} onChange={(v) => set("backgroundFocus", v)} />
            </Field>
          ) : null}
          {p.backgroundImage ? (
            <Field label="Overlay">
              <Select
                value={p.backgroundOverlay || ""}
                onChange={(v) => set("backgroundOverlay", v || undefined)}
                options={OVERLAY_PRESETS}
              />
            </Field>
          ) : (
            <Field label="Fill">
              <BackgroundFill
                background={p.background}
                gradient={p.backgroundGradient}
                onChange={(fill) => onChange({ ...block, props: { ...p, background: fill.background ?? "", backgroundGradient: fill.backgroundGradient } })}
              />
            </Field>
          )}
          <Field label="Width">
            <Select value={p.maxWidth} onChange={(v) => set("maxWidth", v)} options={[
              { value: "site", label: "Follow the site" },
              { value: "full", label: "Edge to edge" },
              { value: "7xl", label: "Wide — 1280px" },
              { value: "6xl", label: "Standard — 1152px" },
              { value: "5xl", label: "Narrow — 1024px" },
              { value: "4xl", label: "Reading — 896px" },
            ]} />
          </Field>
          {/*
            Not "Align": a text block has one of those too, and it means the
            words. This moves the whole block of content within the page's
            column, which is how a paragraph set to "left" ended up on the
            right of a wide screen with nothing explaining it.
          */}
          <Field label="Content position">
            <SegBtns value={p.align} options={["left", "center", "right"]} onChange={(v) => set("align", v)} />
            <p className="text-[11px] text-fg-subtle mt-1">
              Where this section&apos;s contents sit in the page column. Text alignment is set on the text
              itself.
            </p>
          </Field>
          <Field label="Vertical padding"><Input type="number" value={p.paddingY} onChange={(e) => set("paddingY", Number(e.target.value))} /></Field>
          <Field label="Horizontal padding"><Input type="number" value={p.paddingX} onChange={(e) => set("paddingX", Number(e.target.value))} /></Field>
        </>
      );
    }
    case "columns": {
      const p = block.props as ColumnsProps;
      return (
        <>
          <Field label="Number of columns">
            <SegBtns value={String(p.count)} options={["2", "3", "4"]} onChange={(v) => set("count", Number(v) as any)} />
          </Field>
          <Field label="Gap (px)"><Input type="number" value={p.gap} onChange={(e) => set("gap", Number(e.target.value))} /></Field>
          <ColumnBackground props={p} onChange={(next) => onChange({ ...block, props: next })} />
        </>
      );
    }
    case "video":
      return <VideoPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "quote": {
      const p = block.props as QuoteProps;
      return (
        <>
          <Field label="Quote"><Textarea rows={4} value={p.text} onChange={(e) => set("text", e.target.value)} /></Field>
          <Field label="Author"><Input value={p.author} onChange={(e) => set("author", e.target.value)} /></Field>
          <Field label="Role / Company"><Input value={p.role} onChange={(e) => set("role", e.target.value)} /></Field>
          <Field label="Align">
            <SegBtns value={p.align} options={["left", "center", "right"]} onChange={(v) => set("align", v)} />
          </Field>
        </>
      );
    }
    case "list": {
      const p = block.props as ListProps;
      return (
        <>
          <Field label="Style">
            <SegBtns value={p.style} options={["bullet", "number", "check"]} onChange={(v) => set("style", v)} />
          </Field>
          <Field label="Items">
            <div className="space-y-2">
              {p.items.map((it, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input value={it} onChange={(e) => {
                    const next = p.items.slice();
                    next[i] = e.target.value;
                    set("items", next);
                  }} />
                  <button
                    onClick={() => set("items", p.items.filter((_, k) => k !== i))}
                    className="text-fg-subtle hover:text-red-400 text-sm px-1"
                    aria-label="Remove"
                  >×</button>
                </div>
              ))}
              <button
                onClick={() => set("items", [...p.items, "New item"])}
                className="text-xs text-fg-muted hover:text-fg"
              >+ Add item</button>
            </div>
          </Field>
        </>
      );
    }
    case "form":
      // Keyed by block, because the panel remembers which destination kind
      // was picked before an address is typed, and that belongs to one form.
      return <FormPanel key={block.id} block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "html": {
      const p = block.props as HtmlProps;
      return <Field label="HTML"><Textarea rows={8} value={p.html} onChange={(e) => set("html", e.target.value)} /></Field>;
    }
    // The blocks with a panel of any size keep it in a file of their own, so
    // this switch stays a list of what exists rather than all of it at once.
    case "gallery":
      return <GalleryPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "accordion":
      return <AccordionPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "slider":
      return <SliderPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "audio":
      return <AudioPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "icon":
      return <IconPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "social":
      return <SocialPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "table":
      return <TablePanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "pricing":
      return <PricingPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "map":
      return <MapPanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    case "posts": {
      const p = block.props as PostsProps;
      return (
        <>
          <Field label="How many">
            <Input type="number" min={1} max={24} value={p.count} onChange={(e) => set("count", Math.min(24, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Layout">
            <SegBtns value={p.layout} options={["grid", "list"] as const} onChange={(v) => set("layout", v)} labelFor={(v) => (v === "grid" ? "Cards" : "List")} />
          </Field>
          <Field label="Only posts tagged">
            <Input aria-label="Only posts tagged" value={p.tag} placeholder="Every post" onChange={(e) => set("tag", e.target.value)} />
          </Field>
          <Toggle label="Cover pictures" checked={p.showCover} onChange={(v) => set("showCover", v)} />
          <Toggle label="Dates and authors" checked={p.showDate} onChange={(v) => set("showDate", v)} />
          <Toggle label="Summaries" checked={p.showExcerpt} onChange={(v) => set("showExcerpt", v)} />
          <p className="text-[11px] text-fg-subtle">
            Lists the site&apos;s published posts, newest first. A page becomes a post in its page settings, with no
            block selected; the dashboard&apos;s New post makes one directly.
          </p>
        </>
      );
    }
    case "code":
      return <CodePanel block={block} onChange={onChange} linkTargets={linkTargets} siteSlug={siteSlug} />;
    default:
      return <div className="text-xs text-fg-muted">No inspector for this block type.</div>;
  }
}

/**
 * The name links use to reach a section.
 *
 * Kept as typed while it is typed — cleaning each keystroke turned the space
 * in "our team" into a dash and then took the trailing dash away, so the
 * space could never be typed — and shown beside it as the address it
 * becomes. A name another section on this page already has is pointed out,
 * since a link lands on the first and the second can never be reached.
 */
function SectionNameField({ blockId, value, onChange }: { blockId: string; value: string; onChange: (v: string) => void }) {
  const anchors = usePageAnchors();
  const clean = cleanAnchor(value);
  // The page's own list names each section once, with the first section to
  // have the name, so a name is taken when that section is another one.
  const taken = anchors.some((a) => a.anchor === clean && a.blockId !== blockId);
  return (
    <Field label="Name for links">
      <Input aria-label="Name for links" value={value} maxLength={MAX_ANCHOR + 20} placeholder="e.g. prices" onChange={(e) => onChange(e.target.value)} />
      {taken ? (
        <p className="text-[11px] text-amber-400 mt-1">
          Another section on this page is already called &quot;{clean}&quot;. A link goes to the first of the two.
        </p>
      ) : (
        <p className="text-[11px] text-fg-subtle mt-1">
          {clean
            ? `Pick it in any link field, or type #${clean}. Its address is ${anchorHref(clean)}.`
            : "Give it a name, and a button or a menu link can go straight to it."}
        </p>
      )}
    </Field>
  );
}

/**
 * Backdrop for one column at a time.
 *
 * The block itself has nothing to show — it is the columns that carry the
 * image — so the picker names the column first and then edits that one. A
 * column with no backdrop stores nothing, which keeps pages that never use
 * this exactly as they were.
 */
function ColumnBackground({ props, onChange }: { props: ColumnsProps; onChange: (next: ColumnsProps) => void }) {
  const count = clampColumnCount(props.count);
  const [picked, setPicked] = useState(0);
  // Dropping from four columns to two while the fourth was selected would
  // otherwise leave the fields editing a column that is no longer on screen.
  const index = Math.min(picked, count - 1);
  const style: ColumnStyle = props.columnStyles?.[index] ?? {};

  function set<K extends keyof ColumnStyle>(key: K, value: ColumnStyle[K]) {
    update({ [key]: value });
  }

  /** The colour and the gradient together, since one replaces the other. */
  function setFill(background: string | undefined, backgroundGradient: ColumnStyle["backgroundGradient"]) {
    update({ background, backgroundGradient });
  }

  function update(patch: Partial<ColumnStyle>) {
    const list = (props.columnStyles ?? []).slice();
    while (list.length <= index) list.push({});
    const next: ColumnStyle = { ...list[index], ...patch };
    // A backdrop with no inset puts the words hard against the edge of the
    // image, which is never what someone reaches for this to get.
    const painted = patch.backgroundImage || patch.background || patch.backgroundGradient;
    if (painted && next.padding == null) next.padding = 24;
    if (!next.backgroundGradient) delete next.backgroundGradient;
    list[index] = next;
    const used = list.some((s) => Object.values(s).some((v) => v !== undefined && v !== "" && v !== 0));
    onChange({ ...props, columnStyles: used ? list : undefined });
  }

  return (
    <div className="pt-4 border-t border-bg-border space-y-4">
      <Field label="Column backdrop">
        <SegBtns
          value={String(index + 1)}
          options={Array.from({ length: count }, (_, i) => String(i + 1))}
          onChange={(v) => setPicked(Number(v) - 1)}
          nameFor={(v) => `Column ${v}`}
        />
        <p className="text-[11px] text-fg-subtle mt-1">
          Pick a column, then give that one its own image or colour. The others stay as they are.
        </p>
      </Field>
      <Field label="Background image">
        <BackgroundImageField value={style.backgroundImage} onChange={(v) => set("backgroundImage", v)} />
      </Field>
      {style.backgroundImage ? (
        <Field label="Keep in view">
          <FocusPicker src={style.backgroundImage} value={style.backgroundFocus} onChange={(v) => set("backgroundFocus", v)} />
        </Field>
      ) : null}
      {style.backgroundImage ? (
        <Field label="Overlay">
          <Select
            value={style.backgroundOverlay || ""}
            onChange={(v) => set("backgroundOverlay", v || undefined)}
            options={OVERLAY_PRESETS}
          />
        </Field>
      ) : (
        <Field label="Fill">
          <BackgroundFill
            background={style.background ?? ""}
            gradient={style.backgroundGradient}
            inherit="No background"
            onChange={(fill) => setFill(fill.background || undefined, fill.backgroundGradient)}
          />
        </Field>
      )}
      <Field label="Inner padding (px)">
        <Input
          type="number"
          value={style.padding ?? 0}
          onChange={(e) => set("padding", Number(e.target.value) || undefined)}
        />
      </Field>
      <Field label="Corner radius (px)">
        <Input
          type="number"
          value={style.radius ?? 0}
          onChange={(e) => set("radius", Number(e.target.value) || undefined)}
        />
      </Field>
    </div>
  );
}

