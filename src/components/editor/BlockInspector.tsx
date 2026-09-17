"use client";
import { useState } from "react";
import { BaseBlock, HeadingProps, TextProps, ImageProps, ButtonProps, DividerProps, SpacerProps, SectionProps, ColumnsProps, VideoProps, QuoteProps, ListProps, FormProps, HtmlProps } from "@/types";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "./MediaPicker";

interface Placement {
  /** Zero-based column this block currently sits in. */
  current: number;
  count: number;
  onMove: (column: number) => void;
}

interface Props {
  block: BaseBlock | null;
  onChange: (next: BaseBlock) => void;
  onClose: () => void;
  /** Set when the block is a child of a columns block. */
  placement?: Placement;
}

export function BlockInspector({ block, onChange, onClose, placement }: Props) {
  if (!block) {
    return (
      <aside className="w-72 shrink-0 border-l border-bg-border bg-bg-soft h-full p-4 text-sm text-fg-muted">
        <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold mb-3">Inspector</div>
        <div className="rounded-lg border border-dashed border-bg-border p-6 text-center">
          <div className="text-2xl mb-1">←</div>
          Click a block on the page to edit its properties.
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-l border-bg-border bg-bg-soft h-full overflow-y-auto">
      <div className="p-4 border-b border-bg-border sticky top-0 bg-bg-soft z-10 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-fg-subtle">Editing</div>
          <div className="text-sm font-semibold capitalize">{block.type}</div>
        </div>
        <button onClick={onClose} className="text-fg-muted hover:text-fg text-sm">×</button>
      </div>
      <div className="p-4 space-y-4">
        {placement ? <ColumnPlacement placement={placement} /> : null}
        <InspectorBody block={block} onChange={onChange} />
      </div>
    </aside>
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

function InspectorBody({ block, onChange }: { block: BaseBlock; onChange: (next: BaseBlock) => void }) {
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
          <Field label="Alt text"><Input value={p.alt} onChange={(e) => set("alt", e.target.value)} /></Field>
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
        </>
      );
    }
    case "button": {
      const p = block.props as ButtonProps;
      return (
        <>
          <Field label="Label"><Input value={p.label} onChange={(e) => set("label", e.target.value)} /></Field>
          <Field label="Link URL"><Input value={p.href} onChange={(e) => set("href", e.target.value)} /></Field>
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
          <Field label="Background image">
            <BackgroundImageField value={p.backgroundImage} onChange={(v) => set("backgroundImage", v)} />
          </Field>
          {p.backgroundImage ? (
            <Field label="Overlay">
              <Select
                value={p.backgroundOverlay || ""}
                onChange={(v) => set("backgroundOverlay", v || undefined)}
                options={OVERLAY_PRESETS}
              />
            </Field>
          ) : (
            <Field label="Background color"><ColorInput value={p.background} allowTransparent onChange={(v) => set("background", v)} /></Field>
          )}
          <Field label="Max width">
            <Select value={p.maxWidth} onChange={(v) => set("maxWidth", v)} options={[
              { value: "full", label: "Full bleed" },
              { value: "7xl", label: "7XL" },
              { value: "6xl", label: "6XL" },
              { value: "5xl", label: "5XL" },
              { value: "4xl", label: "4XL" },
            ]} />
          </Field>
          <Field label="Align">
            <SegBtns value={p.align} options={["left", "center", "right"]} onChange={(v) => set("align", v)} />
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
        </>
      );
    }
    case "video": {
      const p = block.props as VideoProps;
      return (
        <>
          <Field label="Video URL"><Input value={p.src} onChange={(e) => set("src", e.target.value)} /></Field>
          <Field label="Poster image URL"><Input value={p.poster} onChange={(e) => set("poster", e.target.value)} /></Field>
          <Field label="Aspect ratio">
            <SegBtns value={p.ratio} options={["16/9", "4/3", "1/1", "9/16"]} onChange={(v) => set("ratio", v)} />
          </Field>
        </>
      );
    }
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
    case "form": {
      const p = block.props as FormProps;
      return (
        <>
          <Field label="Submit label"><Input value={p.submitLabel} onChange={(e) => set("submitLabel", e.target.value)} /></Field>
          <Field label="Success message"><Input value={p.successMessage} onChange={(e) => set("successMessage", e.target.value)} /></Field>
          <Field label="Fields">
            <div className="space-y-2">
              {p.fields.map((f, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input value={f.label} onChange={(e) => {
                    const fields = p.fields.slice();
                    fields[i] = { ...f, label: e.target.value };
                    set("fields", fields);
                  }} placeholder="Field label" />
                  <select value={f.type} onChange={(e) => {
                    const fields = p.fields.slice();
                    fields[i] = { ...f, type: e.target.value as any };
                    set("fields", fields);
                  }} className="h-9 w-24 text-xs px-1 rounded-md bg-bg border border-bg-border text-fg">
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="textarea">Textarea</option>
                  </select>
                  <button onClick={() => set("fields", p.fields.filter((_, k) => k !== i))} className="text-fg-subtle hover:text-red-400">×</button>
                </div>
              ))}
              <button onClick={() => set("fields", [...p.fields, { label: "Field", type: "text", required: false }])} className="text-xs text-fg-muted hover:text-fg">+ Add field</button>
            </div>
          </Field>
        </>
      );
    }
    case "html": {
      const p = block.props as HtmlProps;
      return <Field label="HTML"><Textarea rows={8} value={p.html} onChange={(e) => set("html", e.target.value)} /></Field>;
    }
    default:
      return <div className="text-xs text-fg-muted">No inspector for this block type.</div>;
  }
}

const OVERLAY_PRESETS = [
  { value: "", label: "None" },
  { value: "rgba(0,0,0,0.25)", label: "Dark — light" },
  { value: "rgba(0,0,0,0.45)", label: "Dark — medium" },
  { value: "rgba(0,0,0,0.65)", label: "Dark — heavy" },
  { value: "rgba(255,255,255,0.5)", label: "Light tint" },
];

function BackgroundImageField({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
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

function SegBtns<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-bg-border overflow-hidden w-full">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 h-8 text-xs capitalize ${value === o ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card"}`}
        >
          {o.replace("/", " / ")}
        </button>
      ))}
    </div>
  );
}

function ColorInput({
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
