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

export function Form({ props, onChange, disabled, pageId }: Props) {
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled || submitState !== "idle") return;
    setSubmitState("sending");
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    fd.forEach((v, k) => (data[k] = v.toString()));
    try {
      await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, data }),
      });
      setSubmitState("sent");
    } catch {
      setSubmitState("idle");
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
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
                name={f.label}
                disabled={disabled}
                rows={4}
                className="w-full p-2.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 disabled:bg-slate-50"
              />
            ) : (
              <input
                type={f.type}
                required={f.required}
                name={f.label}
                disabled={disabled}
                className="w-full h-10 px-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 disabled:bg-slate-50"
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          disabled={disabled || submitState === "sending"}
          className="h-10 px-6 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50"
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
