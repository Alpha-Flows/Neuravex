"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IconProps } from "@/types";
import { Input, Textarea } from "@/components/ui/Input";
import { ColorInput, Field, SegBtns, type BlockPanelProps } from "../inspector-fields";
import { ICON_NAMES, iconLabel, resolveIconName, searchIcons, type IconName } from "@/lib/icon-names";
import { ICON_SET } from "@/lib/icon-set";
import { editedText, hasFormatting, plainText } from "@/lib/inline-text";
import { textForBox, textFromBox, textHasFormatting } from "@/lib/icon-card";
import { cn } from "@/lib/utils";

const SIZE_NAMES: Record<IconProps["size"], string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra large",
};

/**
 * Said under a box whose stored words have bold or a link in them, which the
 * box cannot show. The same promise the pricing panel makes, in its words.
 */
const FORMATTING_NOTE = "Formatted on the page. Changing the words here keeps them and drops the formatting.";

/**
 * The icon block's settings: which picture, how big, in what, and the words
 * that make it a feature card.
 *
 * The title and text are the same ones the canvas edits in place, but a lone
 * icon has no text on the canvas to click into, so this is the only way to
 * give it some — and emptying both here is how a card goes back to being an
 * icon on its own.
 *
 * Both boxes show words, not the inline HTML they are stored as. They showed
 * the stored form at first, so "Bed & breakfast" came back as "Bed &amp;
 * breakfast" the next time the panel opened, and a `<b>` typed in the box
 * went onto the page as bold rather than as the three characters typed.
 */
export function IconPanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as IconProps;
  const set = (patch: Partial<IconProps>) => onChange({ ...block, props: { ...p, ...patch } });

  return (
    <>
      <Field label="Icon">
        <IconPicker value={resolveIconName(p.icon)} onPick={(icon) => set({ icon })} />
      </Field>
      <Field label="Size">
        <SegBtns
          value={p.size}
          options={["sm", "md", "lg", "xl"] as const}
          onChange={(size) => set({ size })}
          nameFor={(v) => SIZE_NAMES[v]}
        />
      </Field>
      <Field label="Shape">
        <SegBtns
          value={p.shape}
          options={["none", "circle", "square"] as const}
          onChange={(shape) => set({ shape })}
          nameFor={(v) => (v === "none" ? "No shape" : `In a ${v}`)}
        />
      </Field>
      <Field label="Colour">
        <ColorInput value={p.color} onChange={(color) => set({ color })} inherit="Site accent" />
      </Field>
      <Field label="Title">
        <Input
          value={plainText(p.title)}
          onChange={(e) => set({ title: editedText(p.title, e.target.value) })}
          placeholder="None"
          aria-label="Title"
        />
        {hasFormatting(p.title) ? <p className="text-[11px] text-fg-subtle mt-1">{FORMATTING_NOTE}</p> : null}
      </Field>
      <Field label="Text">
        <Textarea
          rows={3}
          value={textForBox(p.text)}
          onChange={(e) => set({ text: textFromBox(p.text, e.target.value) })}
          placeholder="A line or two about it"
          aria-label="Text"
          className="text-sm"
        />
        {textHasFormatting(p.text) ? <p className="text-[11px] text-fg-subtle mt-1">{FORMATTING_NOTE}</p> : null}
      </Field>
      <Field label="Align">
        <SegBtns value={p.align} options={["left", "center", "right"] as const} onChange={(align) => set({ align })} />
      </Field>
      <p className="text-[11px] text-fg-subtle">
        With a title or text this is a feature card; three of them in a Columns block make a row.
      </p>
    </>
  );
}

/**
 * Every icon in a grid, with a search box above it.
 *
 * A hundred-odd buttons, each one a Tab stop, meant a keyboard had to press
 * Tab a hundred times to get past the picker to the size below it. The grid
 * is one stop instead — the current icon, or the first — and the arrow keys
 * move inside it, the way a toolbar or a radio group behaves. A search that
 * leaves the current icon out of the grid would leave nothing to Tab to, so
 * then the first match takes the stop.
 */
function IconPicker({ value, onPick }: { value: IconName; onPick: (name: IconName) => void }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchIcons(query), [query]);
  const grid = useRef<HTMLDivElement>(null);
  const stop = matches.includes(value) ? value : matches[0];
  const Current = ICON_SET[value];

  // The current icon may be far down a grid that shows six rows at a time,
  // and a picker that opens on the star while a pizza is chosen reads as if
  // the pizza were not. Scrolled only as far as it takes, so clicking an icon
  // that is already in view leaves the grid where it is.
  useEffect(() => {
    const box = grid.current;
    const picked = box?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!box || !picked) return;
    // The grid is positioned, so this is measured from its own top edge,
    // whatever it is scrolled to.
    const top = picked.offsetTop;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (top + picked.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = top + picked.offsetHeight - box.clientHeight;
    }
  }, [value, query]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>("button[data-icon]") ?? []);
    const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0 || buttons.length === 0) return;
    // As many columns as the grid has laid out, which depends on how wide the
    // inspector is — so it is read from the page, not assumed.
    const columns = grid.current
      ? getComputedStyle(grid.current).gridTemplateColumns.split(" ").filter(Boolean).length || 1
      : 1;
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
      Home: -from,
      End: buttons.length - 1 - from,
    };
    if (!(e.key in step)) return;
    e.preventDefault();
    const to = Math.min(Math.max(from + step[e.key], 0), buttons.length - 1);
    buttons[to].focus();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-fg">
        <span className="grid place-items-center w-8 h-8 rounded-md border border-bg-border bg-bg text-brand">
          <Current size={18} aria-hidden />
        </span>
        <span className="min-w-0 truncate">{iconLabel(value)}</span>
      </div>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${ICON_NAMES.length} icons`}
        aria-label="Search icons"
        className="text-sm"
      />
      {matches.length > 0 ? (
        <div
          ref={grid}
          role="group"
          aria-label={query ? `Icons matching ${query}` : "Icons"}
          onKeyDown={onKeyDown}
          className="relative grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1 max-h-60 overflow-y-auto rounded-md border border-bg-border bg-bg p-1"
        >
          {matches.map((name) => {
            const Drawing = ICON_SET[name];
            const label = iconLabel(name);
            const picked = name === value;
            return (
              <button
                key={name}
                type="button"
                data-icon={name}
                aria-label={label}
                aria-pressed={picked}
                title={label}
                tabIndex={name === stop ? 0 : -1}
                onClick={() => onPick(name)}
                className={cn(
                  "grid place-items-center h-8 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
                  picked ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card",
                )}
              >
                <Drawing size={18} aria-hidden />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">
          Nothing by that name. Try a plainer word, like &ldquo;shop&rdquo; or &ldquo;food&rdquo;.
        </p>
      )}
    </div>
  );
}
