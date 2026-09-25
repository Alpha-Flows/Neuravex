"use client";
import type { AccordionItem, AccordionProps } from "@/types";
import { Input, Textarea } from "@/components/ui/Input";
import { MAX_ACCORDION_ITEMS, newAccordionItem } from "@/lib/accordion-editing";
import { Field, ListEditor, Select, Toggle, type BlockPanelProps } from "../inspector-fields";

const STYLES: { value: AccordionProps["style"]; label: string }[] = [
  { value: "bordered", label: "Bordered — one box, lines between" },
  { value: "separated", label: "Separated — a card for each" },
  { value: "minimal", label: "Minimal — lines only" },
];

/**
 * The accordion's settings, and every question in one list.
 *
 * The canvas is where a question is written, but it only shows the answers
 * that are open, so a list of twenty is easier to reorder, prune and read
 * through here. The two fields are the same text the canvas edits: what the
 * formatting toolbar wrote there shows up here as its markup.
 */
export function AccordionPanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as AccordionProps;
  const set = (patch: Partial<AccordionProps>) => onChange({ ...block, props: { ...p, ...patch } });

  return (
    <>
      <Field label="Questions">
        <ListEditor<AccordionItem>
          items={p.items}
          onChange={(items) => set({ items })}
          newItem={newAccordionItem}
          addLabel="Add question"
          itemLabel={(_, i) => `Question ${i + 1}`}
          max={MAX_ACCORDION_ITEMS}
          renderItem={(item, update, i) => (
            <>
              <Input
                value={item.title}
                onChange={(e) => update({ ...item, title: e.target.value })}
                placeholder="The question"
                aria-label={`Question ${i + 1}`}
                className="text-sm"
              />
              <Textarea
                rows={3}
                value={item.body}
                onChange={(e) => update({ ...item, body: e.target.value })}
                placeholder="Its answer"
                aria-label={`Answer to question ${i + 1}`}
                className="text-sm"
              />
            </>
          )}
        />
      </Field>
      <Toggle
        label="Opening one closes the others"
        checked={p.exclusive}
        onChange={(exclusive) => set({ exclusive })}
        hint="An older browser lets several stay open, which does no harm."
      />
      <Toggle
        label="Start with the first one open"
        checked={p.openFirst}
        onChange={(openFirst) => set({ openFirst })}
      />
      <Field label="Style">
        <Select value={p.style} onChange={(v) => set({ style: v as AccordionProps["style"] })} options={STYLES} />
      </Field>
    </>
  );
}
