"use client";
import { useEffect, useRef, useState } from "react";
import { FormField, FormProps } from "@/types";
import { domId } from "@/lib/dom-id";
import {
  CONSENT_VALUE,
  HONEYPOT_FIELD,
  answersFrom,
  destinationKind,
  hasChoices,
  submissionKeys,
} from "@/lib/form-fields";
import { Editable } from "./Editable";

interface Props {
  props: FormProps;
  onChange?: (next: FormProps) => void;
  disabled?: boolean;
  pageId?: string;
  /** The block's own id, for the ids that tie each label to its field. */
  blockId?: string;
}

/**
 * A field's choices as drawn. The panel keeps them as typed, blank lines and
 * all, until the validator tidies them on save; the canvas draws only the
 * ones that say something.
 */
function choices(f: FormField): string[] {
  return (f.options ?? []).map((o) => o.trim()).filter(Boolean);
}

/** The clock, read outside render: what it says is only used by the handlers. */
function now(): number {
  return Date.now();
}

/** How long since `start`, or nothing when the form never recorded appearing. */
function millisecondsSince(start: number): number | undefined {
  return start ? now() - start : undefined;
}

// The box every typed-in field is drawn with.
const BOX =
  "w-full rounded-md border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60";

/**
 * A form a visitor fills in.
 *
 * On a page the builder serves, the answers are posted to the builder and
 * stored there; a script does that, and shows the thank-you in place. In a
 * downloaded copy there is no script, and the form posts itself natively to
 * whatever `destination` names — which is why each field is named after its
 * label rather than its position, since that name is what a form service or
 * an email shows beside the answer. With no destination, the export switches
 * the form off and says so (see `disableExportedForms`).
 */
export function Form({ props, onChange, disabled, pageId, blockId }: Props) {
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  // The group of tick boxes that was required and left empty, if any: a
  // browser checks a required box or button by itself, but has no way to say
  // "at least one of these".
  const [unanswered, setUnanswered] = useState<number | null>(null);
  const shownAt = useRef(0);
  const keys = submissionKeys(props.fields);
  const destination = props.destination ?? "";
  const kind = destinationKind(destination);

  useEffect(() => {
    shownAt.current = now();
  }, []);

  // `disabled` means "rendered read-only" — the published page and the
  // preview. That is exactly where the form has to work. It is the editor,
  // where the labels are being authored inline, that must not accept input.
  // Reading it the other way round left every published form inert: visitors
  // could not type in a field or press the button.
  const editing = !disabled;
  const inert = editing ? "pointer-events-none" : "";
  const idOf = (i: number, part = "field") => domId(blockId, part, i);

  function updateField(i: number, next: FormField) {
    const fields = props.fields.slice();
    fields[i] = next;
    onChange?.({ ...props, fields });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editing || submitState === "sending") return;
    const fd = new FormData(e.currentTarget);

    const empty = props.fields.findIndex((f, i) => f.type === "checkboxes" && f.required && fd.getAll(keys[i]).length === 0);
    setUnanswered(empty === -1 ? null : empty);
    if (empty !== -1) {
      e.currentTarget.querySelector<HTMLInputElement>(`input[name="${CSS.escape(keys[empty])}"]`)?.focus();
      return;
    }

    setProblem(null);
    setSubmitState("sending");
    const data = answersFrom(props.fields, fd);
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
        body: JSON.stringify({
          pageId,
          data,
          // What keeps a program from filling the form in; see the route.
          trap: (fd.get(HONEYPOT_FIELD) ?? "").toString(),
          elapsed: millisecondsSince(shownAt.current),
        }),
      });
      // A failed request used to still show the success message, so a visitor
      // was thanked for a submission that was never stored.
      if (res.ok) {
        setSubmitState("sent");
        return;
      }
      const info = await res.json().catch(() => ({}));
      setProblem(typeof info.error === "string" ? info.error : null);
      setSubmitState("error");
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

  /** A field's label as the canvas edits it, with the marker for required. */
  const labelText = (f: FormField, i: number) => (
    <>
      <Editable disabled={disabled} value={f.label} onChange={(label) => updateField(i, { ...f, label })} as="span" />
      {f.required ? (
        <span className="text-red-400 ml-0.5" aria-hidden="true">
          *
        </span>
      ) : null}
    </>
  );

  const help = (f: FormField, i: number) =>
    f.help ? (
      <p id={idOf(i, "help")} className="mt-1 text-xs opacity-70">
        {f.help}
      </p>
    ) : null;

  function control(f: FormField, i: number) {
    const name = keys[i];
    const describedBy = f.help ? idOf(i, "help") : undefined;
    const shared = { id: idOf(i), name, required: f.required, disabled: editing, "aria-describedby": describedBy };

    switch (f.type) {
      case "textarea":
        return <textarea {...shared} rows={4} placeholder={f.placeholder} className={`${BOX} p-2.5 ${inert}`} />;
      case "select":
        return (
          <select {...shared} defaultValue="" className={`${BOX} h-10 px-3 ${inert}`}>
            {/* An empty first choice, so a required dropdown has to be chosen
                rather than quietly answered with whatever was listed first. */}
            <option value="">{f.placeholder || "Please choose…"}</option>
            {choices(f).map((option, k) => (
              <option key={k} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      default:
        return (
          <input
            {...shared}
            type={f.type}
            placeholder={f.placeholder}
            // Filled in by the browser from what it already knows.
            autoComplete={f.type === "email" ? "email" : f.type === "tel" ? "tel" : undefined}
            className={`${BOX} h-10 px-3 ${inert}`}
          />
        );
    }
  }

  function field(f: FormField, i: number) {
    // A set of buttons or of tick boxes is one question with several
    // controls, which is what a fieldset and its legend are for: a screen
    // reader names every option by the question it answers.
    if (hasChoices(f.type) && f.type !== "select") {
      const type = f.type === "radio" ? "radio" : "checkbox";
      const describedBy = f.help ? idOf(i, "help") : undefined;
      return (
        <fieldset aria-describedby={describedBy}>
          <legend className="block text-sm font-medium opacity-80 mb-1">{labelText(f, i)}</legend>
          <div className="space-y-1.5">
            {choices(f).map((option, k) => (
              <label key={k} className={`flex items-center gap-2 text-sm ${inert}`}>
                <input
                  type={type}
                  name={keys[i]}
                  value={option}
                  // A browser needs one button of a required set marked to
                  // insist on an answer; a tick box group is checked on send.
                  required={type === "radio" && f.required && k === 0}
                  disabled={editing}
                  className="h-4 w-4 accent-brand"
                />
                {option}
              </label>
            ))}
          </div>
          {help(f, i)}
          {unanswered === i ? (
            <p role="alert" className="mt-1 text-xs text-red-600">
              Please tick at least one.
            </p>
          ) : null}
        </fieldset>
      );
    }

    if (f.type === "consent") {
      return (
        <div>
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id={idOf(i)}
              name={keys[i]}
              value={CONSENT_VALUE}
              required={f.required}
              disabled={editing}
              aria-describedby={f.help ? idOf(i, "help") : undefined}
              className={`mt-0.5 h-4 w-4 shrink-0 accent-brand ${inert}`}
            />
            <label htmlFor={idOf(i)} className="text-sm opacity-80">
              {labelText(f, i)}
            </label>
          </div>
          {help(f, i)}
        </div>
      );
    }

    return (
      <div>
        {/*
          The label reads the colour of whatever the form is standing on
          rather than pinning itself to slate-700. A Contact page is the
          page most likely to sit on a site's dark band, and a hard-coded
          near-black label on #0b0f1e is a field nobody can see the name
          of. On a light page this lands within a shade of where it was.
        */}
        <label htmlFor={idOf(i)} className="block text-sm font-medium opacity-80 mb-1">
          {labelText(f, i)}
        </label>
        {/*
          No greyed-out look while editing. A field that a visitor will see
          white and a field the canvas paints grey are two different designs,
          and only one of them ships. Transparent to clicks instead, so
          pressing a field on the canvas selects the block it belongs to
          rather than doing nothing at all.
        */}
        {control(f, i)}
        {help(f, i)}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="relative space-y-4"
        // What the downloaded copy does without a script. On the builder's
        // own pages the handler above sends the answers and these are never
        // used; the page's policy would refuse them anyway.
        action={kind === "none" ? undefined : destination}
        method={kind === "none" ? undefined : "post"}
        encType={kind === "email" ? "text/plain" : undefined}
        data-form-destination={kind === "none" ? undefined : kind}
      >
        {props.fields.map((f, i) => (
          <div key={i}>{field(f, i)}</div>
        ))}
        {/*
          The trap: a box no person can see or reach, which a program filling
          in every box it finds fills in too. Off the page rather than hidden,
          since some programs skip what is hidden; out of the Tab order and
          out of what a screen reader lists.
        */}
        <div aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
          <label>
            Leave this empty
            <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        {submitState === "error" ? (
          <p role="alert" className="text-sm text-red-600">
            {problem ?? "Something went wrong sending that. Please try again."}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={editing || submitState === "sending"}
          // Faded only while a submission is in flight. Fading it because the
          // canvas will not accept a click told you nothing about the button
          // your visitors get.
          className={`h-10 px-6 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-hover ${submitState === "sending" ? "opacity-50" : ""} ${inert}`}
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
