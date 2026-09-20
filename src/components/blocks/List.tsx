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
    //
    // The list takes the width the section gives it rather than setting its
    // own. It used to be `max-w-2xl mx-auto`, so a list under a left-aligned
    // paragraph started 112px further in and centred itself against text that
    // was not centred — the section decides the column here, the way it does
    // for every other block.
    <div className="relative">
      <Tag className={`${style} pl-6 space-y-2 marker:text-slate-400`}>
        {props.items.map((item, i) => (
          /*
            A check row is laid out as a flex line, because it draws its own
            mark and has to keep it beside text that wraps. A bullet or a
            numbered row must not be: `display: flex` replaces `list-item`,
            which takes the marker away with it — bullets were invisible
            everywhere in the app and a numbered list came out as plain lines
            with no numbers, which is a numbered list that means nothing.
          */
          <li key={i} className={`relative ${props.style === "check" ? "flex items-start gap-2" : ""}`}>
            {props.style === "check" ? <span className="text-emerald-500 mt-0.5">✓</span> : null}
            <span className={props.style === "check" ? "flex-1" : undefined}>
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
