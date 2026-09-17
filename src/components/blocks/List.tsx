"use client";
import { ListProps } from "@/types";
import { Editable } from "./Editable";

interface Props {
  props: ListProps;
  onChange?: (next: ListProps) => void;
  disabled?: boolean;
}

export function List({ props, onChange, disabled }: Props) {
  function update(i: number, value: string) {
    const next = props.items.slice();
    next[i] = value;
    onChange?.({ ...props, items: next });
  }
  function add() {
    onChange?.({ ...props, items: [...props.items, "New item"] });
  }
  function remove(i: number) {
    onChange?.({ ...props, items: props.items.filter((_, k) => k !== i) });
  }

  const Tag = (props.style === "number" ? "ol" : "ul") as "ol" | "ul";
  const style =
    props.style === "check"
      ? "list-none"
      : props.style === "number"
      ? "list-decimal"
      : "list-disc";

  return (
    // `relative` so the two editing controls can hang over the list rather
    // than sit in it: a remove button per row narrowed every line of text, and
    // "Add item" underneath pushed the rest of the page down, so the list
    // wrapped and sat differently here than on the published page.
    <div className="max-w-2xl mx-auto relative">
      <Tag className={`${style} pl-6 space-y-2 marker:text-slate-400`}>
        {props.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 relative">
            {props.style === "check" ? <span className="text-emerald-500 mt-0.5">✓</span> : null}
            <span className="flex-1">
              <Editable
                as="span"
                disabled={disabled}
                value={item}
                onChange={(v) => update(i, v)}
                placeholder="Item"
              />
            </span>
            {!disabled ? (
              <button
                onClick={() => remove(i)}
                aria-label="Remove item"
                className="nvx-block-chrome absolute right-0 top-0 text-slate-300 hover:text-red-500 text-xs"
              >×</button>
            ) : null}
          </li>
        ))}
      </Tag>
      {!disabled ? (
        <button
          onClick={add}
          className="nvx-block-chrome absolute left-0 top-full mt-1 text-xs text-slate-400 hover:text-slate-700"
        >+ Add item</button>
      ) : null}
    </div>
  );
}
