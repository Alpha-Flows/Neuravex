import { plainText } from "./inline-text";

/**
 * What a form block's fields can be, and the rules every part of the builder
 * reads about them — the block, its panel, the validator, the submissions
 * route and the export.
 *
 * The block had three kinds of field: a line of text, an email address and a
 * box for a message. A booking form wanted a date, an order form a number, an
 * enquiry form a choice of topic, and every form in Germany a box to tick
 * saying the privacy notice had been read — so each of those was a text field
 * with an instruction in its label, and the answers came back in whatever
 * shape a visitor felt like typing. The kinds a browser already knows how to
 * ask for are here now, so it can offer a date picker, a phone keypad and a
 * list to choose from, and refuse an empty required choice itself.
 *
 * No dependencies, because the block and its panel are client components.
 */

export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "textarea",
  "tel",
  "number",
  "date",
  "select",
  "radio",
  "checkboxes",
  "consent",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** What the panel calls each kind, in the words of somebody building a form. */
export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Short text",
  email: "Email address",
  textarea: "Long text",
  tel: "Phone number",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  radio: "One choice",
  checkboxes: "Several choices",
  consent: "Privacy checkbox",
};

/** The kinds that offer a list of answers rather than a box to type in. */
const CHOICE_TYPES: ReadonlySet<FormFieldType> = new Set(["select", "radio", "checkboxes"]);

export function hasChoices(type: FormFieldType): boolean {
  return CHOICE_TYPES.has(type);
}

/**
 * The kinds that show a placeholder. A dropdown shows it as the choice that
 * means "none picked yet"; a date, a tick box and a set of buttons have
 * nowhere to put one.
 */
export function takesPlaceholder(type: FormFieldType): boolean {
  return type === "text" || type === "email" || type === "textarea" || type === "tel" || type === "number" || type === "select";
}

export const MAX_FORM_FIELDS = 100;
export const MAX_OPTIONS = 50;
export const MAX_OPTION_LENGTH = 200;

/**
 * The choices of a dropdown or a set of buttons, cleaned: text, trimmed, each
 * once, and not so many that the list stops being a choice. Two options with
 * the same words sent the same answer, and a reader of the submissions could
 * not tell which one had been picked.
 */
export function formOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const option = entry.trim().slice(0, MAX_OPTION_LENGTH);
    if (option && !out.includes(option)) out.push(option);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

/** The two choices a new dropdown or set of buttons starts with. */
export const STARTER_OPTIONS = ["Option 1", "Option 2"];

/**
 * The sentence a privacy checkbox starts with, linking the notice when the
 * site has one.
 *
 * "Zur Kenntnis genommen" — read and understood — rather than a consent to
 * processing. The generated notice gives the answering of an enquiry as the
 * legal ground for handling it (Art. 6 Abs. 1 lit. b and f DSGVO), and a box
 * asking for consent as well would claim a second ground the notice never
 * mentions, which a visitor could then withdraw.
 */
export function consentLabel(privacyHref?: string): string {
  const notice = privacyHref ? `<a href="${privacyHref.replace(/"/g, "&quot;")}">Datenschutzerklärung</a>` : "Datenschutzerklärung";
  return `Ich habe die ${notice} zur Kenntnis genommen.`;
}

/** A field as it is first added, of the kind asked for. */
export function newField(type: FormFieldType, privacyHref?: string): {
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
} {
  if (type === "consent") return { label: consentLabel(privacyHref), type, required: true };
  if (hasChoices(type)) return { label: "Choose one", type, required: false, options: STARTER_OPTIONS.slice() };
  return { label: FIELD_TYPE_LABELS[type], type, required: false };
}

/**
 * The key each field's answer is stored under.
 *
 * Inputs used to be named after their visible label, so two fields both
 * called "Email" wrote to the same key and one answer was silently dropped.
 * Labels stay the readable key, but repeats are numbered so every field
 * keeps its own answer. The label is read as words, since it may carry a
 * link — the privacy checkbox's does — and a key with markup in it would be
 * what a form service printed in its email.
 */
export function submissionKeys(fields: { label?: string }[]): string[] {
  const seen = new Map<string, number>();
  return fields.map((f) => {
    const base = plainText(f.label ?? "").trim().slice(0, 100) || "Field";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

/** What a ticked privacy checkbox answers — the words a form service shows. */
export const CONSENT_VALUE = "Yes";

/**
 * Every answer in a filled-in form, under its field's key.
 *
 * Several choices come back as one line, in the order they are offered, so
 * the submissions list reads "Tuesday, Thursday" rather than a single one of
 * them — `get()` returns only the first value of a name that has several.
 */
export function answersFrom(fields: { label?: string; type: FormFieldType }[], form: FormData): Record<string, string> {
  const keys = submissionKeys(fields);
  const data: Record<string, string> = {};
  fields.forEach((field, i) => {
    const key = keys[i];
    if (field.type === "checkboxes") {
      data[key] = form.getAll(key).map(String).join(", ");
    } else {
      const value = form.get(key);
      data[key] = typeof value === "string" ? value : "";
    }
  });
  return data;
}

// ---------------------------------------------------------------------------
// Keeping spam out
// ---------------------------------------------------------------------------

/**
 * A field no person sees, which a program filling in every box it finds
 * fills in too.
 *
 * Named `_gotcha` because Formspree reads a field of that name the same way,
 * so the trap keeps working in a downloaded site whose form posts there.
 */
export const HONEYPOT_FIELD = "_gotcha";

/**
 * How soon after the form appeared an answer may be sent.
 *
 * A person reads the labels and types; a program fills the form in the moment
 * it loads. Three seconds is well under what a person takes, even for one
 * field the browser fills in by itself, and a person who is somehow quicker is
 * told to press Send again rather than having the answer thrown away.
 */
export const MIN_FILL_MS = 3000;

// ---------------------------------------------------------------------------
// Where a downloaded copy sends its answers
// ---------------------------------------------------------------------------

/**
 * Where the form in a downloaded copy of the site sends its answers: a form
 * service's address, an email address, or nowhere ("").
 *
 * A downloaded site has no server behind it, so its form could only be
 * switched off — it said it "cannot send anything", on every contact page of
 * every site that left the builder. An address set here is what the form
 * posts to once it is on somebody else's hosting. Only `https:` for a service,
 * since an answer sent over plain http travels readable; only one address for
 * email, since a list or a query string in a `mailto:` is a way to copy the
 * answers to somebody the author never meant.
 */
export function formDestination(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  const email = /^(?:mailto:)?([^\s@<>"',;:?&/]+@[^\s@<>"',;:?&/]+\.[a-z]{2,})$/i.exec(trimmed);
  if (email) return `mailto:${email[1]}`;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return "";
  return url.toString();
}

export type DestinationKind = "none" | "email" | "service";

export function destinationKind(destination: string): DestinationKind {
  if (!destination) return "none";
  return destination.startsWith("mailto:") ? "email" : "service";
}

/**
 * What the downloaded page's policy has to allow for a form to be sent there:
 * the service's origin, or `mailto:`.
 *
 * The origin rather than the whole address, because a service answers a post
 * by sending the browser on to a thank-you page of its own, and the policy
 * applies to that step too — allowed only the one path, the answer arrived
 * and the visitor was shown an error.
 */
export function destinationSource(destination: string): string | null {
  const clean = formDestination(destination);
  if (!clean) return null;
  if (clean.startsWith("mailto:")) return "mailto:";
  return new URL(clean).origin;
}

/** The host a service destination sends to, for the privacy notice. */
export function destinationHost(destination: string): string | null {
  const clean = formDestination(destination);
  if (!clean || clean.startsWith("mailto:")) return null;
  return new URL(clean).hostname;
}
