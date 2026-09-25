"use client";
import { useState } from "react";
import type { FormField, FormProps } from "@/types";
import { Input, Textarea } from "@/components/ui/Input";
import { editedText, hasFormatting, plainText } from "@/lib/inline-text";
import { pagePath } from "@/lib/page-links";
import {
  FIELD_TYPE_LABELS,
  FORM_FIELD_TYPES,
  MAX_FORM_FIELDS,
  STARTER_OPTIONS,
  destinationKind,
  formDestination,
  hasChoices,
  newField,
  takesPlaceholder,
  type DestinationKind,
  type FormFieldType,
} from "@/lib/form-fields";
import { Field, ListEditor, SegBtns, Select, Toggle, type BlockPanelProps } from "../inspector-fields";

const TYPES = FORM_FIELD_TYPES.map((value) => ({ value, label: FIELD_TYPE_LABELS[value] }));

/** What each destination does in the downloaded copy, in a sentence. */
const DESTINATION_HELP: Record<DestinationKind, string> = {
  none:
    "The downloaded copy cannot send anything, and says so beneath the form. On this builder's own pages, answers are stored here either way.",
  email:
    "The visitor's own email program opens with the answers written out, addressed to you. Nothing passes through a server — and nothing happens for a visitor with no email program set up.",
  service:
    "Paste the address a form service gave you — Formspree, Basin, Getform and the like. Answers go to that service, and the privacy notice names it.",
};

/**
 * The form's fields, what they ask, and where a downloaded copy sends them.
 *
 * The list used to be three things per row — a label, one of three kinds and
 * a remove button — with no way to say a field was required at all, though
 * every template's form had required fields. Each row now holds everything
 * a field has, and a field's kind decides what else is asked: a placeholder
 * only where a box can show one, a list of choices only where there are
 * choices.
 */
export function FormPanel({ block, onChange, linkTargets, siteSlug }: BlockPanelProps) {
  const p = block.props as FormProps;
  const set = (patch: Partial<FormProps>) => onChange({ ...block, props: { ...p, ...patch } });

  // The destination's kind is kept here as well as read from the address: an
  // author who picks "Email" has not typed an address yet, and read only
  // from the address the choice would flip straight back to "Nothing".
  const [kind, setKind] = useState<DestinationKind>(destinationKind(p.destination ?? ""));
  const destination = p.destination ?? "";
  const unusable = destination.trim() !== "" && formDestination(destination) === "";

  const privacy = linkTargets?.find((t) => t.legalKind === "datenschutz");
  const privacyHref = privacy && siteSlug ? pagePath(siteSlug, privacy.slug, false) : undefined;
  const hasConsent = p.fields.some((f) => f.type === "consent");

  function retype(field: FormField, type: FormFieldType): FormField {
    const next: FormField = { ...field, type };
    if (hasChoices(type) && !(field.options && field.options.length > 0)) next.options = STARTER_OPTIONS.slice();
    if (!hasChoices(type)) delete next.options;
    if (!takesPlaceholder(type)) delete next.placeholder;
    return next;
  }

  return (
    <>
      <Field label="Fields">
        <ListEditor<FormField>
          items={p.fields}
          onChange={(fields) => set({ fields })}
          newItem={() => newField("text")}
          addLabel="Add field"
          itemLabel={(f, i) => plainText(f.label).trim() || `Field ${i + 1}`}
          max={MAX_FORM_FIELDS}
          renderItem={(f, update, i) => {
            const name = plainText(f.label).trim() || `field ${i + 1}`;
            return (
              <>
                <Input
                  value={plainText(f.label)}
                  onChange={(e) => update({ ...f, label: editedText(f.label, e.target.value) })}
                  placeholder="What the field asks"
                  aria-label={`Label of ${name}`}
                  className="text-sm"
                />
                {hasFormatting(f.label) ? (
                  <p className="text-[11px] text-fg-subtle">
                    {f.type === "consent"
                      ? "Its link to the privacy notice is kept while the words are the same; edit the link on the canvas."
                      : "Formatted on the canvas; retyping it here keeps the words and drops the formatting."}
                  </p>
                ) : null}
                <Select
                  value={f.type}
                  onChange={(v) => update(retype(f, v as FormFieldType))}
                  options={TYPES}
                />
                <Toggle label="Required" checked={f.required} onChange={(required) => update({ ...f, required })} />
                {takesPlaceholder(f.type) ? (
                  <Input
                    value={f.placeholder ?? ""}
                    onChange={(e) => update({ ...f, placeholder: e.target.value })}
                    placeholder={f.type === "select" ? "The choice that means none yet" : "Shown in the empty box"}
                    aria-label={`Placeholder of ${name}`}
                    className="text-sm"
                  />
                ) : null}
                <Input
                  value={f.help ?? ""}
                  onChange={(e) => update({ ...f, help: e.target.value })}
                  placeholder="Help beneath the field (optional)"
                  aria-label={`Help text of ${name}`}
                  className="text-sm"
                />
                {hasChoices(f.type) ? (
                  <Textarea
                    rows={Math.min(8, Math.max(3, (f.options ?? []).length + 1))}
                    // One per line, kept as typed while the author types —
                    // the validator trims and de-duplicates on save, and doing
                    // it here would swallow the space being typed.
                    value={(f.options ?? []).join("\n")}
                    onChange={(e) => update({ ...f, options: e.target.value.split("\n") })}
                    placeholder={"One choice per line"}
                    aria-label={`Choices of ${name}, one per line`}
                    className="text-sm"
                  />
                ) : null}
              </>
            );
          }}
        />
        {!hasConsent ? (
          <div className="mt-2 space-y-1">
            <button
              type="button"
              onClick={() => set({ fields: [...p.fields, newField("consent", privacyHref)] })}
              disabled={p.fields.length >= MAX_FORM_FIELDS}
              className="text-xs text-fg-muted hover:text-fg"
            >
              + Add privacy checkbox
            </button>
            <p className="text-[11px] text-fg-subtle">
              {privacyHref
                ? "A required box to tick, saying the privacy notice has been read, with a link to it."
                : "A required box to tick, saying the privacy notice has been read. Generate the legal pages in the site's settings first and it links to the notice."}
            </p>
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-fg-subtle">
          A hidden trap field and a minimum time to fill the form in keep most programs from sending answers.
        </p>
      </Field>
      <Field label="Submit label">
        <Input value={plainText(p.submitLabel)} onChange={(e) => set({ submitLabel: editedText(p.submitLabel, e.target.value) })} />
      </Field>
      <Field label="Success message">
        <Input value={plainText(p.successMessage)} onChange={(e) => set({ successMessage: editedText(p.successMessage, e.target.value) })} />
      </Field>
      <Field label="In the downloaded site, answers go to">
        <SegBtns<DestinationKind>
          value={kind}
          onChange={(next) => {
            setKind(next);
            // Switching kind starts from an empty address rather than keeping
            // a service's URL in an email field, or the other way round.
            if (next === "none" || destinationKind(destination) !== next) set({ destination: "" });
          }}
          options={["none", "email", "service"] as const}
          labelFor={(v) => ({ none: "Nowhere", email: "Email", service: "Service" })[v]}
        />
        {kind !== "none" ? (
          <Input
            value={destination.startsWith("mailto:") ? destination.slice("mailto:".length) : destination}
            onChange={(e) => set({ destination: e.target.value })}
            placeholder={kind === "email" ? "you@example.com" : "https://formspree.io/f/…"}
            aria-label={kind === "email" ? "Email address answers go to" : "Form service address"}
            className="mt-2 text-sm"
          />
        ) : null}
        {unusable ? (
          <p className="mt-1 text-[11px] text-amber-400">
            {kind === "email"
              ? "That is not one email address, so the downloaded form will not be able to send."
              : "Only an https address of a form service can be used, so the downloaded form will not be able to send."}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-fg-subtle">{DESTINATION_HELP[kind]}</p>
      </Field>
    </>
  );
}
