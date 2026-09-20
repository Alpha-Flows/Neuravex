/**
 * The Impressum.
 *
 * § 5 DDG (the Digitale-Dienste-Gesetz, which took over from § 5 TMG in May
 * 2024) requires a digital service offered for consideration to keep certain
 * information "leicht erkennbar, unmittelbar erreichbar und ständig
 * verfügbar". That last phrase is why this app puts the link in the footer of
 * every page rather than leaving it to the operator to remember.
 *
 * Two things this deliberately does not write, both of which most generators
 * still do:
 *
 * **The EU online dispute resolution link.** Regulation (EU) 2024/3228
 * repealed the ODR Regulation; the platform stopped taking complaints in
 * March 2025 and shut down on 20 July 2025, and the duty to link to it went
 * with it. Emitting it now sends customers to a dead address and states an
 * obligation that no longer exists. The VSBG statement below is a different
 * thing and is still required.
 *
 * **A "Haftung für Inhalte / Links / Urheberrecht" disclaimer.** No provision
 * asks for one. Liability for one's own and for linked content is settled by
 * §§ 7–10 DDG whatever a page says about it, so the usual three paragraphs
 * restate the statute without changing anything — and a disclaimer that
 * overstates it can do harm. Anyone who wants the text can add it: this is an
 * ordinary page in the builder.
 */

import { BaseBlock } from "@/types";
import { SiteLook } from "../page-starters";
import {
  LegalProfile,
  REGISTER_KINDS,
  legalForm,
} from "./profile";
import { addressLines, h, legalSection, lines, p, space, stacked } from "./render";

function registerLabel(kind: string): string {
  return REGISTER_KINDS.find((r) => r.id === kind)?.label ?? "Register";
}

/** The German name of the register, without the app's English framing. */
function registerGerman(kind: string): string {
  switch (kind) {
    case "hrb": return "Handelsregister B";
    case "hra": return "Handelsregister A";
    case "vr": return "Vereinsregister";
    case "pr": return "Partnerschaftsregister";
    case "gnr": return "Genossenschaftsregister";
    default: return registerLabel(kind);
  }
}

const DISPUTE_UNWILLING =
  "Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer " +
  "Verbraucherschlichtungsstelle teilzunehmen.";

export function buildImpressum(profile: LegalProfile, look: SiteLook): BaseBlock[] {
  const form = legalForm(profile.legalForm);
  const body: BaseBlock[] = [];

  body.push(h(look, "Impressum", 1));
  body.push(space(24));

  // — § 5 Abs. 1 Nr. 1 DDG: who runs this —
  body.push(h(look, "Angaben gemäß § 5 DDG", 2));
  body.push(space(12));
  const provider = lines(
    profile.companyName,
    form.represented && profile.representatives.filter((r) => r.trim()).length > 0
      ? `Vertreten durch: ${profile.representatives.filter((r) => r.trim()).map((r) => r.trim()).join(", ")}`
      : null,
    ...addressLines(profile.address),
  );
  if (provider.length) body.push(stacked(look, provider));

  // — § 5 Abs. 1 Nr. 2 DDG: a fast, direct route —
  const contact = lines(
    profile.phone && `Telefon: ${profile.phone}`,
    profile.email && `E-Mail: ${profile.email}`,
    profile.contactPagePath && `Kontaktformular: ${profile.contactPagePath}`,
  );
  if (contact.length) {
    body.push(space(28));
    body.push(h(look, "Kontakt", 2));
    body.push(space(12));
    body.push(stacked(look, contact));
  }

  // — § 5 Abs. 1 Nr. 4 DDG: the register entry —
  if (form.registered && (profile.registerCourt || profile.registerNumber)) {
    body.push(space(28));
    body.push(h(look, "Registereintrag", 2));
    body.push(space(12));
    body.push(
      stacked(
        look,
        lines(
          profile.registerKind && `Eintragung im ${registerGerman(profile.registerKind)}`,
          profile.registerCourt && `Registergericht: ${profile.registerCourt}`,
          profile.registerNumber && `Registernummer: ${profile.registerNumber}`,
        ),
      ),
    );
  }

  // — § 27a UStG / § 139c AO —
  if (profile.vatId || profile.economicId) {
    body.push(space(28));
    body.push(h(look, "Steuerliche Angaben", 2));
    body.push(space(12));
    if (profile.vatId) {
      body.push(
        p(look, `Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: ${profile.vatId.trim()}`),
      );
    }
    if (profile.economicId) {
      body.push(
        p(look, `Wirtschafts-Identifikationsnummer gemäß § 139c Abgabenordnung: ${profile.economicId.trim()}`),
      );
    }
  }

  // — § 5 Abs. 1 Nr. 5 DDG: regulated professions —
  if (profile.regulatedProfession) {
    body.push(space(28));
    body.push(h(look, "Berufsrechtliche Angaben", 2));
    body.push(space(12));
    body.push(
      stacked(
        look,
        lines(
          profile.professionTitle && `Gesetzliche Berufsbezeichnung: ${profile.professionTitle}`,
          profile.professionCountry && `Verliehen in: ${profile.professionCountry}`,
          profile.professionChamber && `Zuständige Kammer: ${profile.professionChamber}`,
          profile.professionRules && `Berufsrechtliche Regelungen: ${profile.professionRules}`,
          profile.professionRulesUrl && `Einsehbar unter: ${profile.professionRulesUrl}`,
        ),
      ),
    );
  }

  // — § 5 Abs. 1 Nr. 3 DDG: the authority, where the activity needs one —
  if (profile.supervisoryAuthority) {
    body.push(space(28));
    body.push(h(look, "Zuständige Aufsichtsbehörde", 2));
    body.push(space(12));
    body.push(stacked(look, lines(profile.supervisoryAuthority, profile.supervisoryAuthorityUrl)));
  }

  // — § 18 Abs. 2 MStV: who answers for editorial content —
  if (profile.editorialContent && profile.editorialResponsible) {
    body.push(space(28));
    body.push(h(look, "Redaktionell verantwortlich gemäß § 18 Abs. 2 MStV", 2));
    body.push(space(12));
    const editorialAddress = profile.editorialAddressSameAsProvider ? profile.address : profile.editorialAddress;
    body.push(stacked(look, lines(profile.editorialResponsible, ...addressLines(editorialAddress))));
  }

  // — §§ 36, 37 VSBG: a statement either way —
  body.push(space(28));
  body.push(h(look, "Verbraucherstreitbeilegung", 2));
  body.push(space(12));
  if (profile.disputeStance === "unwilling") {
    body.push(p(look, DISPUTE_UNWILLING));
  } else {
    const obliged = profile.disputeStance === "obliged";
    body.push(
      p(
        look,
        obliged
          ? "Wir sind verpflichtet, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Zuständig ist:"
          : "Wir nehmen an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil. Zuständig ist:",
      ),
    );
    body.push(space(12));
    body.push(stacked(look, lines(profile.disputeBoardName, profile.disputeBoardAddress, profile.disputeBoardUrl)));
  }

  if (profile.additionalNotes.trim()) {
    body.push(space(28));
    for (const paragraph of profile.additionalNotes.split(/\n{2,}/)) {
      if (paragraph.trim()) body.push(p(look, paragraph.trim()));
    }
  }

  return [legalSection(look, body)];
}
