/**
 * What a German site operator has to be able to say about themselves.
 *
 * Two documents are compulsory for a site run from Germany, and both are made
 * of the same handful of facts: an **Impressum** (§ 5 DDG — the Digitale-
 * Dienste-Gesetz that replaced § 5 TMG in May 2024 — and, for editorial
 * content, § 18 Abs. 2 MStV) and a **Datenschutzerklärung** (Art. 13 DSGVO).
 * Asking for those facts once and writing both documents from them is the
 * whole point of this file.
 *
 * What is required is not the same for everyone, which is why this is not one
 * flat list of fields. A sole trader has no register entry and no
 * representatives; a GmbH must name both. A physiotherapist must name their
 * chamber, their legal professional title and the state that granted it; a
 * shop owner must not, because saying so would be inventing a licence. So the
 * legal form drives which fields are asked for and which are checked, and
 * `missingFor` is the one place that knows the difference.
 *
 * None of this is legal advice, and nothing here can be. It produces the
 * sections the statutes name, filled in with what the operator told it — a
 * first draft to be read and signed off by whoever is liable for it, which is
 * never this program.
 */

import { z } from "zod";

/**
 * The legal forms worth telling apart.
 *
 * They differ in exactly two ways that matter here: whether there is a
 * register entry to name, and whether somebody has to be named as
 * representing the business (§ 5 Abs. 1 Nr. 1 DDG — "bei juristischen
 * Personen zusätzlich die Vertretungsberechtigten").
 */
export const LEGAL_FORMS = [
  { id: "einzelunternehmen", label: "Sole trader (Einzelunternehmen)", registered: false, represented: false },
  { id: "eingetragener-kaufmann", label: "Registered sole trader (e.K.)", registered: true, represented: false },
  { id: "freiberufler", label: "Freelance professional (Freiberufler:in)", registered: false, represented: false },
  { id: "gbr", label: "GbR", registered: false, represented: true },
  { id: "partg", label: "Partnerschaftsgesellschaft (PartG / PartmbB)", registered: true, represented: true },
  { id: "ohg", label: "OHG", registered: true, represented: true },
  { id: "kg", label: "KG", registered: true, represented: true },
  { id: "gmbh", label: "GmbH", registered: true, represented: true },
  { id: "gmbh-co-kg", label: "GmbH & Co. KG", registered: true, represented: true },
  { id: "ug", label: "UG (haftungsbeschränkt)", registered: true, represented: true },
  { id: "ag", label: "AG", registered: true, represented: true },
  { id: "eg", label: "eG (Genossenschaft)", registered: true, represented: true },
  { id: "ev", label: "e.V. (Verein)", registered: true, represented: true },
  { id: "sonstige", label: "Something else", registered: false, represented: false },
] as const;

export type LegalFormId = (typeof LEGAL_FORMS)[number]["id"];

export function legalForm(id: string) {
  return LEGAL_FORMS.find((f) => f.id === id) ?? LEGAL_FORMS[LEGAL_FORMS.length - 1];
}

/** The register a legal form is entered in, which is part of what must be named. */
export const REGISTER_KINDS = [
  { id: "hrb", label: "Handelsregister B (HRB)" },
  { id: "hra", label: "Handelsregister A (HRA)" },
  { id: "vr", label: "Vereinsregister (VR)" },
  { id: "pr", label: "Partnerschaftsregister (PR)" },
  { id: "gnr", label: "Genossenschaftsregister (GnR)" },
] as const;

/**
 * The register a legal form is normally entered in.
 *
 * It follows from the legal form rather than being an independent choice — a
 * GmbH is in Handelsregister B, an OHG in A, a Verein in the Vereinsregister —
 * so the flow fills it in and lets it be changed, instead of showing a
 * dropdown whose first option is displayed but was never chosen.
 */
export function defaultRegisterKind(formId: string): string {
  switch (formId) {
    case "ohg":
    case "kg":
    case "gmbh-co-kg":
    case "eingetragener-kaufmann":
      return "hra";
    case "ev":
      return "vr";
    case "partg":
      return "pr";
    case "eg":
      return "gnr";
    case "gmbh":
    case "ug":
    case "ag":
      return "hrb";
    default:
      return "";
  }
}

/**
 * Whether the operator takes part in consumer arbitration (§ 36 VSBG).
 *
 * Saying nothing is not an option for a business that runs a website and had
 * more than ten employees on 31 December of the previous year: § 36 Abs. 1
 * VSBG requires a statement either way, "leicht zugänglich, klar und
 * verständlich". Saying "no" is a perfectly good answer and the common one.
 */
export const DISPUTE_STANCES = [
  { id: "unwilling", label: "No — we are not willing and not obliged" },
  { id: "voluntary", label: "Yes — we take part voluntarily" },
  { id: "obliged", label: "Yes — we are obliged to take part" },
] as const;

/** What happens to what somebody types into a form on this site. */
export const FORM_FATES = [
  { id: "none", label: "Nothing — the form is decorative or not wired up" },
  { id: "email", label: "It reaches us by email" },
  { id: "stored", label: "Our host stores it for us" },
] as const;

const trimmed = z.string().trim();
const optional = trimmed.default("");

export const addressSchema = z.object({
  street: optional,
  /** c/o, a building, a floor — whatever the first line does not hold. */
  extra: optional,
  postalCode: optional,
  city: optional,
  country: trimmed.default("Deutschland"),
});

export const legalProfileSchema = z.object({
  /** Bumped when the shape changes in a way a stored profile has to be read through. */
  version: z.number().int().default(1),

  // — who is behind the site (§ 5 Abs. 1 Nr. 1 DDG) —
  legalForm: z.string().default("einzelunternehmen"),
  /** The name the business trades and is liable under. */
  companyName: optional,
  /** Vertretungsberechtigte — required once the operator is a legal person. */
  representatives: z.array(trimmed).default([]),
  address: addressSchema.prefault({}),

  // — how to reach them quickly and directly (§ 5 Abs. 1 Nr. 2 DDG) —
  email: optional,
  phone: optional,
  /** A contact page, when the second fast route is a form rather than a phone. */
  contactPagePath: optional,

  // — register, tax, supervision —
  registerKind: optional,
  registerCourt: optional,
  registerNumber: optional,
  /** USt-IdNr. under § 27a UStG, if one was issued. */
  vatId: optional,
  /** Wirtschafts-Identifikationsnummer under § 139c AO, if one was issued. */
  economicId: optional,
  supervisoryAuthority: optional,
  supervisoryAuthorityUrl: optional,

  // — regulated professions (§ 5 Abs. 1 Nr. 5 DDG) —
  regulatedProfession: z.boolean().default(false),
  /** The legal professional title, e.g. "Rechtsanwältin". */
  professionTitle: optional,
  /** The state that granted it — "verliehen in der Bundesrepublik Deutschland". */
  professionCountry: trimmed.default("Deutschland"),
  /** The chamber the operator belongs to. */
  professionChamber: optional,
  /** What the professional rules are called, and where they can be read. */
  professionRules: optional,
  professionRulesUrl: optional,

  // — editorial responsibility (§ 18 Abs. 2 MStV) —
  /** True once the site carries journalistic-editorial content, e.g. a news section. */
  editorialContent: z.boolean().default(false),
  editorialResponsible: optional,
  editorialAddressSameAsProvider: z.boolean().default(true),
  editorialAddress: addressSchema.prefault({}),

  // — consumer arbitration (§§ 36, 37 VSBG) —
  disputeStance: z.string().default("unwilling"),
  disputeBoardName: optional,
  disputeBoardAddress: optional,
  disputeBoardUrl: optional,

  // — data protection —
  /** A Datenschutzbeauftragte:r, where one had to be or was appointed. */
  hasDpo: z.boolean().default(false),
  dpoName: optional,
  dpoEmail: optional,
  dpoAddressSameAsProvider: z.boolean().default(true),
  dpoAddress: addressSchema.prefault({}),
  /** Who serves the finished site, and whether there is a contract under Art. 28. */
  hostingProvider: optional,
  hostingAddress: optional,
  hostingDpa: z.boolean().default(true),
  /** How long the host keeps its access logs, in days. Empty means unstated. */
  logRetentionDays: optional,
  /** What becomes of a form submission where this site is hosted. */
  formFate: z.string().default("none"),
  /** How long a form submission is kept, in words. */
  formRetention: optional,
  /** The supervisory authority a visitor can complain to (Art. 77 DSGVO). */
  dataAuthority: optional,
  dataAuthorityUrl: optional,

  /** Anything the operator wants appended to the Impressum verbatim. */
  additionalNotes: optional,
});

export type LegalProfile = z.infer<typeof legalProfileSchema>;
export type LegalAddress = z.infer<typeof addressSchema>;

/** An empty profile, with every default applied. */
export function emptyProfile(): LegalProfile {
  return legalProfileSchema.parse({});
}

/**
 * Read a stored profile, whatever state it is in.
 *
 * A half-filled profile is the normal case — the flow saves as it goes — so
 * this never throws. Anything unreadable comes back as a blank profile rather
 * than as an exception on a settings page.
 */
export function parseProfile(stored: string | null | undefined): LegalProfile {
  if (!stored) return emptyProfile();
  try {
    const parsed = legalProfileSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

export interface MissingField {
  /** The field on the profile, so the flow can point at it. */
  field: string;
  /** Which step of the flow it belongs to. */
  step: LegalStep;
  /** What is missing, and the provision that asks for it. */
  label: string;
}

export type LegalStep = "provider" | "contact" | "register" | "profession" | "editorial" | "privacy";

const hasText = (v: string | undefined) => !!v && v.trim().length > 0;

function addressMissing(address: LegalAddress): boolean {
  return !hasText(address.street) || !hasText(address.postalCode) || !hasText(address.city);
}

/**
 * Everything the law names that this profile cannot yet say.
 *
 * This is the gate on generating: a document with a blank where the address
 * belongs is worse than no document, because it looks finished. What counts
 * as missing depends on the legal form and on what the operator has told us
 * they do, so it is worked out here rather than listed in the form.
 */
export function missingFor(profile: LegalProfile): MissingField[] {
  const form = legalForm(profile.legalForm);
  const out: MissingField[] = [];
  const need = (cond: boolean, field: string, step: LegalStep, label: string) => {
    if (cond) out.push({ field, step, label });
  };

  need(!hasText(profile.companyName), "companyName", "provider", "The name the site is run under (§ 5 Abs. 1 Nr. 1 DDG)");
  need(
    form.represented && profile.representatives.filter(hasText).length === 0,
    "representatives",
    "provider",
    "At least one authorised representative (§ 5 Abs. 1 Nr. 1 DDG)",
  );
  need(addressMissing(profile.address), "address", "provider", "A full postal address — no PO box (§ 5 Abs. 1 Nr. 1 DDG)");

  need(!hasText(profile.email), "email", "contact", "An email address (§ 5 Abs. 1 Nr. 2 DDG)");
  need(
    !hasText(profile.phone) && !hasText(profile.contactPagePath),
    "phone",
    "contact",
    "A second fast route — a telephone number or a contact form (§ 5 Abs. 1 Nr. 2 DDG)",
  );

  if (form.registered) {
    need(!hasText(profile.registerKind), "registerKind", "register", "Which register the entry is in (§ 5 Abs. 1 Nr. 4 DDG)");
    need(!hasText(profile.registerCourt), "registerCourt", "register", "The registering court (§ 5 Abs. 1 Nr. 4 DDG)");
    need(!hasText(profile.registerNumber), "registerNumber", "register", "The register number (§ 5 Abs. 1 Nr. 4 DDG)");
  }

  if (profile.regulatedProfession) {
    need(!hasText(profile.professionTitle), "professionTitle", "profession", "The legal professional title (§ 5 Abs. 1 Nr. 5 DDG)");
    need(!hasText(profile.professionCountry), "professionCountry", "profession", "The state that granted the title (§ 5 Abs. 1 Nr. 5 DDG)");
    need(!hasText(profile.professionChamber), "professionChamber", "profession", "The chamber the profession belongs to (§ 5 Abs. 1 Nr. 5 DDG)");
    need(!hasText(profile.professionRules), "professionRules", "profession", "What the professional rules are called (§ 5 Abs. 1 Nr. 5 DDG)");
    need(
      !hasText(profile.professionRulesUrl),
      "professionRulesUrl",
      "profession",
      "Where those rules can be read (§ 5 Abs. 1 Nr. 5 DDG)",
    );
  }

  if (profile.editorialContent) {
    need(
      !hasText(profile.editorialResponsible),
      "editorialResponsible",
      "editorial",
      "Who is responsible for the content (§ 18 Abs. 2 MStV)",
    );
    need(
      !profile.editorialAddressSameAsProvider && addressMissing(profile.editorialAddress),
      "editorialAddress",
      "editorial",
      "That person's address (§ 18 Abs. 2 MStV)",
    );
  }

  if (profile.disputeStance !== "unwilling") {
    need(!hasText(profile.disputeBoardName), "disputeBoardName", "contact", "The arbitration board taken part in (§ 36 Abs. 1 Nr. 2 VSBG)");
    need(!hasText(profile.disputeBoardAddress), "disputeBoardAddress", "contact", "That board's address (§ 36 Abs. 1 Nr. 2 VSBG)");
  }

  if (profile.hasDpo) {
    need(!hasText(profile.dpoName), "dpoName", "privacy", "The data protection officer's name (Art. 13 Abs. 1 lit. b DSGVO)");
    need(!hasText(profile.dpoEmail), "dpoEmail", "privacy", "How to reach them (Art. 13 Abs. 1 lit. b DSGVO)");
  }

  need(!hasText(profile.hostingProvider), "hostingProvider", "privacy", "Who hosts the finished site (Art. 13 Abs. 1 lit. e DSGVO)");
  need(
    profile.formFate !== "none" && !hasText(profile.formRetention),
    "formRetention",
    "privacy",
    "How long form submissions are kept (Art. 13 Abs. 2 lit. a DSGVO)",
  );

  return out;
}

/** True once both documents can be written without a blank where a fact belongs. */
export function isComplete(profile: LegalProfile): boolean {
  return missingFor(profile).length === 0;
}
