"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import {
  DISPUTE_STANCES,
  DPA_ANSWERS,
  FORM_FATES,
  LEGAL_FORMS,
  REGISTER_KINDS,
  type LegalProfile,
  type LegalStep,
  type MissingField,
  defaultRegisterKind,
  emptyProfile,
  legalForm,
} from "@/lib/legal/profile";
import type { SiteAudit } from "@/lib/legal/audit";

/**
 * The flow that collects what a German Impressum and Datenschutzerklärung are
 * made of, and puts both on the site.
 *
 * It is a sequence rather than one long form because what is required depends
 * on the answers: a sole trader is never asked for a register number, and
 * nobody is asked to name a chamber until they say their profession is
 * regulated. Steps that cannot apply are skipped rather than shown greyed
 * out, so the flow is as short as the operator's situation allows.
 *
 * The labels are English, like the rest of the builder, with the German legal
 * term beside each one — that is the word that will appear on the finished
 * page and the word on the operator's own paperwork, so it has to be
 * matchable. The documents themselves are German throughout.
 */

const STEPS: { id: LegalStep | "review"; label: string }[] = [
  { id: "provider", label: "Who runs the site" },
  { id: "contact", label: "Contact" },
  { id: "register", label: "Register & tax" },
  { id: "profession", label: "Profession" },
  { id: "editorial", label: "Editorial" },
  { id: "privacy", label: "Data protection" },
  { id: "review", label: "Review" },
];

interface LegalState {
  profile: LegalProfile;
  missing: MissingField[];
  audit: SiteAudit;
  contactPages: { slug: string; title: string }[];
  generated: { id: string; kind: string; slug: string; title: string; published: boolean }[];
  language: string;
}

export function LegalFlow({ siteId, siteSlug }: { siteId: string; siteSlug: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LegalState | null>(null);
  const [profile, setProfile] = useState<LegalProfile>(emptyProfile());
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ slug: string; title: string }[] | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/legal`);
    if (!res.ok) return;
    const data: LegalState = await res.json();
    setState(data);
    setProfile(data.profile);
  }, [siteId]);

  /** Opening is what asks for the details, so the click is where it belongs. */
  const openFlow = useCallback(() => {
    setOpen(true);
    if (!state) void load();
  }, [state, load]);

  const form = legalForm(profile.legalForm);

  /**
   * Steps that cannot apply to this operator are never shown — not greyed
   * out, not skipped over. "Register & tax" stays for everyone, because a VAT
   * ID and a supervisory authority are not tied to being in a register.
   */
  const steps = STEPS.filter((s) => {
    if (s.id === "profession") return profile.regulatedProfession;
    if (s.id === "editorial") return profile.editorialContent;
    return true;
  });
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  function set<K extends keyof LegalProfile>(key: K, value: LegalProfile[K]) {
    setProfile((p) => {
      const next = { ...p, [key]: value };
      // The register follows from the legal form. Without this the dropdown
      // showed "Handelsregister B" as its first option while the profile
      // still held nothing, so the review step asked for a register that was
      // on screen the whole time.
      if (key === "legalForm") {
        const suggested = defaultRegisterKind(String(value));
        // Overwrite only a value this put there in the first place. Switching
        // GmbH to OHG should move Handelsregister B to A; a register the
        // operator picked by hand is theirs and stays.
        const wasSuggested = !p.registerKind || p.registerKind === defaultRegisterKind(p.legalForm);
        if (suggested && wasSuggested) next.registerKind = suggested;
      }
      return next;
    });
  }
  function setAddress(key: "address" | "editorialAddress" | "dpoAddress", field: string, value: string) {
    setProfile((p) => ({ ...p, [key]: { ...p[key], [field]: value } }));
  }

  /** Saves what has been typed so far. Closing the tab at step three should not cost an address. */
  async function persist(next: LegalProfile) {
    const res = await fetch(`/api/sites/${siteId}/legal`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      const data = await res.json();
      setState((s) => (s ? { ...s, missing: data.missing } : s));
    }
  }

  async function forward() {
    setError("");
    await persist(profile);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/legal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not write the pages.");
        if (Array.isArray(data.missing)) setState((s) => (s ? { ...s, missing: data.missing } : s));
        return;
      }
      setDone(data.applied.map((a: { slug: string; title: string }) => ({ slug: a.slug, title: a.title })));
      router.refresh();
      void load();
    } finally {
      setBusy(false);
    }
  }

  const missing = state?.missing ?? [];
  const missingHere = missing.filter((m) => m.step === step?.id);

  return (
    <>
      <Button variant="outline" onClick={openFlow}>
        Impressum &amp; Datenschutz
      </Button>
      {!open ? null : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-xl border border-bg-border bg-bg-soft shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 pt-5 pb-3 border-b border-bg-border">
              <h2 className="text-lg font-semibold">German legal pages</h2>
              <p className="text-xs text-fg-subtle mt-1">
                An Impressum (§ 5 DDG) and a Datenschutzerklärung (Art. 13 DSGVO), written from your details and
                linked in the footer of every page.
              </p>
              <nav className="flex flex-wrap gap-1 mt-3">
                {steps.map((s, i) => {
                  const stepMissing = missing.filter((m) => m.step === s.id).length;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStepIndex(i)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                        i === stepIndex
                          ? "border-brand bg-brand/15 text-fg"
                          : "border-transparent text-fg-muted hover:text-fg"
                      }`}
                    >
                      {s.label}
                      {stepMissing > 0 ? <span className="ml-1 text-amber-400">•</span> : null}
                    </button>
                  );
                })}
              </nav>
            </header>

            <div className="p-5 overflow-y-auto space-y-4">
              {!state ? (
                <p className="text-sm text-fg-muted">Loading…</p>
              ) : done ? (
                <Done pages={done} siteSlug={siteSlug} onBack={() => setDone(null)} />
              ) : (
                <>
                  {step?.id === "provider" && (
                    <Provider profile={profile} set={set} setAddress={setAddress} />
                  )}
                  {step?.id === "contact" && (
                    <Contact profile={profile} set={set} contactPages={state.contactPages} siteSlug={siteSlug} />
                  )}
                  {step?.id === "register" && <Register profile={profile} set={set} />}
                  {step?.id === "profession" && <Profession profile={profile} set={set} />}
                  {step?.id === "editorial" && (
                    <Editorial profile={profile} set={set} setAddress={setAddress} />
                  )}
                  {step?.id === "privacy" && (
                    <Privacy profile={profile} set={set} setAddress={setAddress} audit={state.audit} />
                  )}
                  {step?.id === "review" && (
                    <Review profile={profile} audit={state.audit} missing={missing} language={state.language} />
                  )}

                  {missingHere.length > 0 && step?.id !== "review" ? (
                    <ul className="text-xs text-amber-400 space-y-1 border-t border-bg-border pt-3">
                      {missingHere.map((m) => (
                        <li key={m.field}>Still needed: {m.label}</li>
                      ))}
                    </ul>
                  ) : null}
                  {error ? <p className="text-sm text-red-400">{error}</p> : null}
                </>
              )}
            </div>

            {done ? null : (
              <footer className="px-5 py-4 border-t border-bg-border flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => void persist(profile).then(() => setOpen(false))}>
                    Save and close
                  </Button>
                  {step?.id === "review" ? (
                    <Button onClick={generate} loading={busy} disabled={missing.length > 0}>
                      {state?.generated.length ? "Update both pages" : "Create both pages"}
                    </Button>
                  ) : (
                    <Button onClick={forward}>Next</Button>
                  )}
                </div>
              </footer>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── steps ─────────────────────────────────────────────────────────

type Setter = <K extends keyof LegalProfile>(key: K, value: LegalProfile[K]) => void;
type AddressSetter = (key: "address" | "editorialAddress" | "dpoAddress", field: string, value: string) => void;

/**
 * One labelled control.
 *
 * The control sits inside the `<label>` rather than beside it. A label with
 * no `for` and no nesting is a caption, not a label: a screen reader reading
 * this form would announce an edit field and nothing about what belongs in
 * it, and clicking the words would not focus the box. Nesting associates the
 * two without having to mint an id for every field on the page.
 */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wide">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-fg-subtle mt-1 normal-case tracking-normal font-normal">{hint}</span> : null}
    </label>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex gap-2.5 items-start cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        <span className="text-sm">{label}</span>
        {hint ? <span className="block text-xs text-fg-subtle mt-0.5">{hint}</span> : null}
      </span>
    </label>
  );
}

function Choice({
  value,
  onChange,
  options,
  placeholder = "Choose…",
}: {
  value: string;
  onChange: (next: string) => void;
  options: readonly { id: string; label: string }[];
  placeholder?: string;
}) {
  // A select whose value matches none of its options shows the first one while
  // holding nothing, so the review step asks for a choice that has been on
  // screen all along. An unchosen value gets an option of its own instead.
  const chosen = options.some((o) => o.id === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
    >
      {chosen ? null : <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function AddressFields({
  address,
  onChange,
}: {
  address: LegalProfile["address"];
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field label="Street and number (Straße, Hausnummer)">
          <Input value={address.street} onChange={(e) => onChange("street", e.target.value)} placeholder="Musterstraße 1" />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label="Additional line (Adresszusatz)">
          <Input value={address.extra} onChange={(e) => onChange("extra", e.target.value)} placeholder="c/o, floor, building" />
        </Field>
      </div>
      <Field label="Postcode (PLZ)">
        <Input value={address.postalCode} onChange={(e) => onChange("postalCode", e.target.value)} placeholder="10115" />
      </Field>
      <Field label="Town (Ort)">
        <Input value={address.city} onChange={(e) => onChange("city", e.target.value)} placeholder="Berlin" />
      </Field>
      <div className="col-span-2">
        <Field label="Country (Land)">
          <Input value={address.country} onChange={(e) => onChange("country", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

function Provider({
  profile,
  set,
  setAddress,
}: {
  profile: LegalProfile;
  set: Setter;
  setAddress: AddressSetter;
}) {
  const form = legalForm(profile.legalForm);
  const reps = profile.representatives.length ? profile.representatives : [""];
  return (
    <div className="space-y-4">
      <Field
        label="Legal form (Rechtsform)"
        hint="This decides what the law asks you for. A GmbH must name its managing directors and its register entry; a sole trader has neither."
      >
        <Choice value={profile.legalForm} onChange={(v) => set("legalForm", v)} options={LEGAL_FORMS} />
      </Field>
      <Field label="Name you trade and are liable under (Name / Firma)">
        <Input value={profile.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="Muster GmbH" />
      </Field>
      {form.represented ? (
        <Field
          label="Authorised representatives (Vertretungsberechtigte)"
          hint="One per line. § 5 Abs. 1 Nr. 1 DDG asks for these once the operator is a legal person."
        >
          <Textarea
            rows={3}
            value={reps.join("\n")}
            onChange={(e) => set("representatives", e.target.value.split("\n"))}
            placeholder={"Erika Mustermann\nMax Mustermann"}
          />
        </Field>
      ) : null}
      <div className="border-t border-bg-border pt-4">
        <p className="text-xs text-fg-subtle mb-3">
          A postal address where you can be served. A PO box is not enough — § 5 DDG wants the address, and a
          Zustellungsbevollmächtigter is the usual answer if you do not want your home address on the page.
        </p>
        <AddressFields address={profile.address} onChange={(f, v) => setAddress("address", f, v)} />
      </div>
    </div>
  );
}

function Contact({
  profile,
  set,
  contactPages,
  siteSlug,
}: {
  profile: LegalProfile;
  set: Setter;
  contactPages: { slug: string; title: string }[];
  siteSlug: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-subtle">
        § 5 Abs. 1 Nr. 2 DDG wants an email address and one more route that reaches you quickly and directly —
        a telephone number, or a contact form on this site.
      </p>
      <Field label="Email (E-Mail)">
        <Input value={profile.email} onChange={(e) => set("email", e.target.value)} placeholder="kontakt@example.de" />
      </Field>
      <Field label="Telephone (Telefon)">
        <Input value={profile.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+49 30 1234567" />
      </Field>
      <Field label="Or a contact page on this site" hint="Used only when you would rather not publish a number.">
        <select
          value={profile.contactPagePath}
          onChange={(e) => set("contactPagePath", e.target.value)}
          className="h-9 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <option value="">No contact page</option>
          {contactPages.map((p) => (
            <option key={p.slug} value={`/sites/${siteSlug}/${p.slug}`}>
              {p.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="border-t border-bg-border pt-4 space-y-3">
        <Field
          label="Consumer arbitration (Verbraucherstreitbeilegung, § 36 VSBG)"
          hint="A statement either way is required of a business that runs a website and had more than ten employees on 31 December last year. Saying no is a normal answer."
        >
          <Choice value={profile.disputeStance} onChange={(v) => set("disputeStance", v)} options={DISPUTE_STANCES} />
        </Field>
        {profile.disputeStance !== "unwilling" ? (
          <>
            <Field label="Arbitration board (Schlichtungsstelle)">
              <Input value={profile.disputeBoardName} onChange={(e) => set("disputeBoardName", e.target.value)} />
            </Field>
            <Field label="Its address">
              <Input value={profile.disputeBoardAddress} onChange={(e) => set("disputeBoardAddress", e.target.value)} />
            </Field>
            <Field label="Its website">
              <Input value={profile.disputeBoardUrl} onChange={(e) => set("disputeBoardUrl", e.target.value)} />
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Register({ profile, set }: { profile: LegalProfile; set: Setter }) {
  const form = legalForm(profile.legalForm);
  return (
    <div className="space-y-4">
      {form.registered ? (
        <>
          <p className="text-xs text-fg-subtle">
            A {form.label} is entered in a register, and § 5 Abs. 1 Nr. 4 DDG asks for the register, the court
            and the number.
          </p>
          <Field label="Register (Registerart)">
            <Choice value={profile.registerKind} onChange={(v) => set("registerKind", v)} options={REGISTER_KINDS} />
          </Field>
          <Field label="Registering court (Registergericht)">
            <Input
              value={profile.registerCourt}
              onChange={(e) => set("registerCourt", e.target.value)}
              placeholder="Amtsgericht Berlin-Charlottenburg"
            />
          </Field>
          <Field label="Register number (Registernummer)">
            <Input value={profile.registerNumber} onChange={(e) => set("registerNumber", e.target.value)} placeholder="HRB 123456" />
          </Field>
        </>
      ) : (
        <p className="text-xs text-fg-subtle">
          A {form.label} has no register entry to name, so this step is only about tax numbers.
        </p>
      )}
      <div className="border-t border-bg-border pt-4 space-y-3">
        <Field
          label="VAT ID (USt-IdNr.)"
          hint="Only if one was issued to you. § 27a UStG asks for it to be named when it exists; inventing one is worse than leaving it out."
        >
          <Input value={profile.vatId} onChange={(e) => set("vatId", e.target.value)} placeholder="DE123456789" />
        </Field>
        <Field label="Business ID (Wirtschafts-IdNr., § 139c AO)">
          <Input value={profile.economicId} onChange={(e) => set("economicId", e.target.value)} />
        </Field>
        <Field
          label="Supervisory authority (Aufsichtsbehörde)"
          hint="Only where your activity needs official authorisation — a broker, an insurance intermediary, a care service."
        >
          <Input value={profile.supervisoryAuthority} onChange={(e) => set("supervisoryAuthority", e.target.value)} />
        </Field>
        {profile.supervisoryAuthority ? (
          <Field label="Its website">
            <Input value={profile.supervisoryAuthorityUrl} onChange={(e) => set("supervisoryAuthorityUrl", e.target.value)} />
          </Field>
        ) : null}
      </div>
      <div className="border-t border-bg-border pt-4 space-y-3">
        <Check
          checked={profile.regulatedProfession}
          onChange={(v) => set("regulatedProfession", v)}
          label="Mine is a regulated profession (reglementierter Beruf)"
          hint="Doctors, lawyers, tax advisers, architects, physiotherapists and the like. It adds a step asking for your chamber and professional title."
        />
        <Check
          checked={profile.editorialContent}
          onChange={(v) => set("editorialContent", v)}
          label="This site carries journalistic-editorial content"
          hint="A news section, a magazine, regular commentary. § 18 Abs. 2 MStV then wants a named person responsible for it."
        />
      </div>
    </div>
  );
}

function Profession({ profile, set }: { profile: LegalProfile; set: Setter }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-subtle">
        § 5 Abs. 1 Nr. 5 DDG asks a regulated profession for its chamber, its legal title, the state that granted
        it, and where the professional rules can be read.
      </p>
      <Field label="Legal professional title (Gesetzliche Berufsbezeichnung)">
        <Input value={profile.professionTitle} onChange={(e) => set("professionTitle", e.target.value)} placeholder="Rechtsanwältin" />
      </Field>
      <Field label="Granted in (Verliehen in)">
        <Input value={profile.professionCountry} onChange={(e) => set("professionCountry", e.target.value)} />
      </Field>
      <Field label="Chamber (Zuständige Kammer)">
        <Input value={profile.professionChamber} onChange={(e) => set("professionChamber", e.target.value)} placeholder="Rechtsanwaltskammer Berlin" />
      </Field>
      <Field label="Professional rules (Berufsrechtliche Regelungen)">
        <Input value={profile.professionRules} onChange={(e) => set("professionRules", e.target.value)} placeholder="BRAO, BORA, RVG" />
      </Field>
      <Field label="Where they can be read">
        <Input value={profile.professionRulesUrl} onChange={(e) => set("professionRulesUrl", e.target.value)} placeholder="https://www.brak.de/…" />
      </Field>
    </div>
  );
}

function Editorial({
  profile,
  set,
  setAddress,
}: {
  profile: LegalProfile;
  set: Setter;
  setAddress: AddressSetter;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-subtle">
        § 18 Abs. 2 MStV wants a named natural person, with an address, answering for journalistic-editorial
        content — not the company.
      </p>
      <Field label="Responsible person (Verantwortlich für den Inhalt)">
        <Input value={profile.editorialResponsible} onChange={(e) => set("editorialResponsible", e.target.value)} />
      </Field>
      <Check
        checked={profile.editorialAddressSameAsProvider}
        onChange={(v) => set("editorialAddressSameAsProvider", v)}
        label="Same address as above"
      />
      {profile.editorialAddressSameAsProvider ? null : (
        <AddressFields address={profile.editorialAddress} onChange={(f, v) => setAddress("editorialAddress", f, v)} />
      )}
    </div>
  );
}

function Privacy({
  profile,
  set,
  setAddress,
  audit,
}: {
  profile: LegalProfile;
  set: Setter;
  setAddress: AddressSetter;
  audit: SiteAudit;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Who hosts the finished site (Hosting-Anbieter)"
        hint="Whoever serves the files once you have downloaded the site. Their server writes the access logs the notice has to describe."
      >
        <Input value={profile.hostingProvider} onChange={(e) => set("hostingProvider", e.target.value)} placeholder="Hetzner Online GmbH" />
      </Field>
      <Field label="Their address">
        <Input value={profile.hostingAddress} onChange={(e) => set("hostingAddress", e.target.value)} placeholder="Industriestr. 25, 91710 Gunzenhausen" />
      </Field>
      <Field
        label="Is there a data processing agreement with them? (AV-Vertrag, Art. 28 DSGVO)"
        hint="Every German host offers one — but the notice will only say you have one once you say so. Leave it unanswered and it says nothing about it."
      >
        <Choice value={profile.hostingDpa} onChange={(v) => set("hostingDpa", v as typeof profile.hostingDpa)} options={DPA_ANSWERS} />
      </Field>
      <Field label="How long the host keeps access logs, in days" hint="Leave empty if you do not know; the text then says so rather than inventing a number.">
        <Input value={profile.logRetentionDays} onChange={(e) => set("logRetentionDays", e.target.value)} placeholder="7" />
      </Field>

      {audit.hasForm ? (
        <div className="border-t border-bg-border pt-4 space-y-3">
          <p className="text-xs text-fg-subtle">
            This site has a form on it. A downloaded Neuravex site carries no scripts, so unless you have wired
            the form up to something it sends nowhere — and the notice should say so rather than describe
            processing that does not happen.
          </p>
          <Field label="What happens to a submission">
            <Choice value={profile.formFate} onChange={(v) => set("formFate", v as typeof profile.formFate)} options={FORM_FATES} />
          </Field>
          {profile.formFate !== "none" && profile.formFate !== "" ? (
            <Field label="How long you keep it (Aufbewahrung)">
              <Input
                value={profile.formRetention}
                onChange={(e) => set("formRetention", e.target.value)}
                placeholder="bis zur abschließenden Bearbeitung der Anfrage, längstens 6 Monate"
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-bg-border pt-4 space-y-3">
        <Check
          checked={profile.hasDpo}
          onChange={(v) => set("hasDpo", v)}
          label="We have a data protection officer (Datenschutzbeauftragte:r)"
          hint="Required under § 38 BDSG once at least 20 people are constantly engaged in automated processing, and in some other cases."
        />
        {profile.hasDpo ? (
          <>
            <Field label="Name">
              <Input value={profile.dpoName} onChange={(e) => set("dpoName", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={profile.dpoEmail} onChange={(e) => set("dpoEmail", e.target.value)} />
            </Field>
            <Check
              checked={profile.dpoAddressSameAsProvider}
              onChange={(v) => set("dpoAddressSameAsProvider", v)}
              label="Same address as the operator"
            />
            {profile.dpoAddressSameAsProvider ? null : (
              <AddressFields address={profile.dpoAddress} onChange={(f, v) => setAddress("dpoAddress", f, v)} />
            )}
          </>
        ) : null}
      </div>

      <div className="border-t border-bg-border pt-4 space-y-3">
        <Field
          label="Your data protection authority (Aufsichtsbehörde)"
          hint="Optional. Left empty, the notice tells visitors they may complain to the authority of their own state, which is always true."
        >
          <Input value={profile.dataAuthority} onChange={(e) => set("dataAuthority", e.target.value)} />
        </Field>
        {profile.dataAuthority ? (
          <Field label="Its website">
            <Input value={profile.dataAuthorityUrl} onChange={(e) => set("dataAuthorityUrl", e.target.value)} />
          </Field>
        ) : null}
      </div>
    </div>
  );
}

function Review({
  profile,
  audit,
  missing,
  language,
}: {
  profile: LegalProfile;
  audit: SiteAudit;
  missing: MissingField[];
  language: string;
}) {
  return (
    <div className="space-y-4 text-sm">
      {missing.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="font-medium text-amber-300 text-sm">Not ready yet</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-200/90">
            {missing.map((m) => (
              <li key={m.field}>{m.label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-fg-muted text-xs">
          Both documents can be written from what you have entered. They will be created as ordinary pages you
          can open and edit, published, and linked in the footer of every page and subpage.
        </p>
      )}

      <div className="rounded-lg border border-bg-border p-3">
        <p className="text-xs uppercase tracking-wide text-fg-subtle mb-2">What this site does with visitor data</p>
        {audit.selfContained && !audit.hasForm ? (
          <p className="text-xs text-fg-muted">
            Nothing on this site reaches outside the visitor&apos;s browser: no cookies, no trackers, no embedded
            third-party content. The notice will say exactly that.
          </p>
        ) : (
          <ul className="text-xs text-fg-muted space-y-1">
            {audit.hasForm ? <li>A form that can collect what a visitor types.</li> : null}
            {audit.formHosts.map((host) => (
              <li key={`form-${host}`}>
                Form answers sent to <span className="text-fg">{host}</span> by the downloaded site — the notice
                names it.
              </li>
            ))}
            {audit.remoteHosts.map((host) => (
              <li key={host}>
                Content loaded from <span className="text-fg">{host}</span> — the visitor&apos;s IP reaches that
                server before they agree to anything.
              </li>
            ))}
          </ul>
        )}
        {audit.remoteHosts.length > 0 ? (
          <p className="text-xs text-amber-400/90 mt-2">
            Neuravex ships no consent banner. Embedded third-party content generally needs consent under § 25
            Abs. 1 TDDDG before it loads; hosting those files yourself avoids the question entirely.
          </p>
        ) : null}
      </div>

      {language !== "de" ? (
        <p className="text-xs text-fg-subtle">
          This site&apos;s language is set to <span className="text-fg">{language}</span>, and both documents are
          written in German. You may want to set the language to <span className="text-fg">de</span> in
          Settings → SEO.
        </p>
      ) : null}

      <details className="text-xs text-fg-subtle">
        <summary className="cursor-pointer text-fg-muted">Two things this deliberately leaves out</summary>
        <p className="mt-2">
          <span className="text-fg">The EU online dispute resolution link.</span> Regulation (EU) 2024/3228
          repealed the ODR Regulation and the platform shut down on 20 July 2025. Most generators still emit the
          link; it now points at a dead page and states an obligation that no longer exists. The VSBG statement on
          the Impressum is a different duty and is still there.
        </p>
        <p className="mt-2">
          <span className="text-fg">A &ldquo;Haftung für Inhalte / Links / Urheberrecht&rdquo; disclaimer.</span>{" "}
          No provision asks for one, and §§ 7–10 DDG settle liability whatever the page says. If you want the
          text anyway, the Impressum is an ordinary page — add a block.
        </p>
      </details>

      <p className="text-xs text-fg-subtle border-t border-bg-border pt-3">
        {profile.companyName || "You"} remain responsible for what these pages say. This writes the sections the
        statutes name from the details you gave; it is not legal advice, and it cannot know your circumstances.
        Have them read before you publish.
      </p>
    </div>
  );
}

function Done({
  pages,
  siteSlug,
  onBack,
}: {
  pages: { slug: string; title: string }[];
  siteSlug: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm">Both pages are live and linked in the footer of every page.</p>
      <ul className="space-y-2">
        {pages.map((p) => (
          <li key={p.slug} className="flex items-center justify-between rounded-md border border-bg-border px-3 py-2">
            <span className="text-sm">{p.title}</span>
            <a
              href={`/sites/${siteSlug}/${p.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand hover:underline"
            >
              /sites/{siteSlug}/{p.slug} ↗
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-subtle">
        Change a detail and run this again — the same two pages are rewritten, and whatever was on them is kept
        in their revision history.
      </p>
      <Button variant="ghost" onClick={onBack}>
        Back to the details
      </Button>
    </div>
  );
}
