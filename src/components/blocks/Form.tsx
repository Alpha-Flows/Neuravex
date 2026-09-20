"use client";
import { useState } from "react";
import { FormProps } from "@/types";
import { Editable } from "./Editable";

interface Props {
  props: FormProps;
  onChange?: (next: FormProps) => void;
  disabled?: boolean;
  pageId?: string;
}

/**
 * The key each field's answer is stored under.
 *
 * Inputs used to be named after their visible label, so two fields both
 * called "Email" wrote to the same key and one answer was silently dropped.
 * Labels stay the readable key, but repeats are numbered so every field
 * keeps its own answer.
 */
export function submissionKeys(fields: FormProps["fields"]): string[] {
  const seen = new Map<string, number>();
  return fields.map((f) => {
    const base = (f.label ?? "").trim() || "Field";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

export function Form({ props, onChange, disabled, pageId }: Props) {
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const keys = submissionKeys(props.fields);

  // `disabled` means "rendered read-only" — the published page and the
  // preview. That is exactly where the form has to work. It is the editor,
  // where the labels are being authored inline, that must not accept input.
  // Reading it the other way round left every published form inert: visitors
  // could not type in a field or press the button.
  const editing = !disabled;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editing || submitState !== "idle") return;
    setSubmitState("sending");
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    // Read by position, so renaming a label never orphans an answer.
    props.fields.forEach((_, i) => {
      data[keys[i]] = (fd.get(`field-${i}`) ?? "").toString();
    });
    // No page to attach to means this is the editor's preview: let someone
    // try the form out, but there is nothing to store.
    if (!pageId) {
      setSubmitState("sent");
      return;
    }

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, data }),
      });
      // A failed request used to still show the success message, so a visitor
      // was thanked for a submission that was never stored.
      setSubmitState(res.ok ? "sent" : "error");
    } catch {
      setSubmitState("error");
    }
  }

  if (submitState === "sent") {
    return (
      <div className="max-w-xl mx-auto rounded-xl bg-emerald-50 border border-emerald-200 p-8 text-center">
        <Editable disabled={disabled} value={props.successMessage} onChange={(v) => onChange?.({ ...props, successMessage: v })} as="p" className="text-emerald-700 text-base" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {props.fields.map((f, i) => (
          <div key={i}>
            {/*
              The label reads the colour of whatever the form is standing on
              rather than pinning itself to slate-700. A Contact page is the
              page most likely to sit on a site's dark band, and a hard-coded
              near-black label on #0b0f1e is a field nobody can see the name
              of. On a light page this lands within a shade of where it was.
            */}
            <label className="block text-sm font-medium opacity-80 mb-1">
              <Editable
                disabled={disabled}
                value={f.label}
                onChange={(v) => {
                  const fields = props.fields.slice();
                  fields[i] = { ...f, label: v };
                  onChange?.({ ...props, fields });
                }}
                as="span"
              />
              {f.required ? <span className="text-red-400 ml-0.5">*</span> : null}
            </label>
            {f.type === "textarea" ? (
              <textarea
                required={f.required}
                name={`field-${i}`}
                disabled={editing}
                rows={4}
                // No greyed-out look while editing. A field that a visitor
                // will see white and a field the canvas paints grey are two
                // different designs, and only one of them ships. Transparent
                // to clicks instead, so pressing a field on the canvas selects
                // the block it belongs to rather than doing nothing at all.
                className={`w-full p-2.5 rounded-md border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 ${editing ? "pointer-events-none" : ""}`}
              />
            ) : (
              <input
                type={f.type}
                required={f.required}
                name={`field-${i}`}
                disabled={editing}
                className={`w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 ${editing ? "pointer-events-none" : ""}`}
              />
            )}
          </div>
        ))}
        {submitState === "error" ? (
          <p className="text-sm text-red-600">
            Something went wrong sending that. Please try again.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={editing || submitState === "sending"}
          // Faded only while a submission is in flight. Fading it because the
          // canvas will not accept a click told you nothing about the button
          // your visitors get.
          className={`h-10 px-6 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-hover ${submitState === "sending" ? "opacity-50" : ""} ${editing ? "pointer-events-none" : ""}`}
        >
          <Editable
            disabled={disabled}
            value={props.submitLabel}
            onChange={(v) => onChange?.({ ...props, submitLabel: v })}
            as="span"
          />
          {submitState === "sending" ? "…" : ""}
        </button>
      </form>
    </div>
  );
}
