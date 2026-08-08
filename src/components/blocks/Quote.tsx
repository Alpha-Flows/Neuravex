"use client";
import { Editable } from "./Editable";
import { QuoteProps } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  props: QuoteProps;
  onChange?: (next: QuoteProps) => void;
  disabled?: boolean;
}

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

export function Quote({ props, onChange, disabled }: Props) {
  return (
    <blockquote className={cn("max-w-3xl mx-auto", alignClass[props.align])}>
      <Editable
        as="p"
        disabled={disabled}
        value={props.text}
        onChange={(text) => onChange?.({ ...props, text })}
        placeholder="Quote text"
        multiline
        className="text-2xl md:text-3xl font-medium leading-snug text-slate-900"
        style={{ whiteSpace: "pre-wrap" }}
      />
      <footer className="mt-4 text-sm text-slate-500">
        — <Editable
          as="span"
          disabled={disabled}
          value={props.author}
          onChange={(author) => onChange?.({ ...props, author })}
          placeholder="Name"
        />
        {props.role ? (
          <>
            , <Editable
              as="span"
              disabled={disabled}
              value={props.role}
              onChange={(role) => onChange?.({ ...props, role })}
              placeholder="Role, Company"
            />
          </>
        ) : null}
      </footer>
    </blockquote>
  );
}
