/**
 * The Datenschutzerklärung.
 *
 * Art. 13 DSGVO says what a visitor must be told at the moment their data is
 * collected, and says it must be "in präziser, transparenter, verständlicher
 * und leicht zugänglicher Form" (Art. 12 Abs. 1). The usual generator output
 * fails that last test by listing every service the generator has ever heard
 * of, so a reader cannot tell what this site does from what it does not.
 *
 * This one writes what the site actually does. `auditSite` walks the pages
 * first, and a section about embedded third-party content only appears when
 * something is embedded. A Neuravex site that was downloaded and put on a
 * host is plain HTML and CSS with no scripts at all — the export strips
 * them — so for most sites the honest text is short: the host's access logs,
 * and whatever a form collects.
 *
 * The Art. 21 objection notice is kept in its own section on purpose.
 * Art. 21 Abs. 4 requires it to be given "in einer verständlichen und von
 * anderen Informationen getrennten Form", which a bullet in a list of rights
 * is not.
 */

import { BaseBlock } from "@/types";
import { SiteLook } from "../page-starters";
import { SiteAudit } from "./audit";
import { LegalProfile } from "./profile";
import { addressLines, bullets, h, legalSection, lines, p, space, stacked } from "./render";

const RIGHTS = [
  "Auskunft über die zu Ihrer Person gespeicherten Daten und deren Verarbeitung (Art. 15 DSGVO)",
  "Berichtigung unrichtiger Daten (Art. 16 DSGVO)",
  "Löschung Ihrer bei uns gespeicherten Daten (Art. 17 DSGVO)",
  "Einschränkung der Verarbeitung, soweit wir Ihre Daten aufgrund gesetzlicher Pflichten noch nicht löschen dürfen (Art. 18 DSGVO)",
  "Datenübertragbarkeit, soweit Sie in die Verarbeitung eingewilligt haben oder einen Vertrag mit uns abgeschlossen haben (Art. 20 DSGVO)",
  "Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)",
  "Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)",
];

const OBJECTION =
  "Werden Ihre personenbezogenen Daten auf Grundlage berechtigter Interessen gemäß Art. 6 Abs. 1 " +
  "lit. f DSGVO verarbeitet, haben Sie das Recht, aus Gründen, die sich aus Ihrer besonderen " +
  "Situation ergeben, jederzeit Widerspruch gegen diese Verarbeitung einzulegen. Legen Sie " +
  "Widerspruch ein, werden wir Ihre personenbezogenen Daten nicht mehr verarbeiten, es sei denn, " +
  "wir können zwingende schutzwürdige Gründe für die Verarbeitung nachweisen, die Ihre Interessen, " +
  "Rechte und Freiheiten überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder " +
  "Verteidigung von Rechtsansprüchen.";

/** How long the host keeps its logs, as a sentence, or a neutral one when unstated. */
function logRetention(days: string): string {
  const trimmed = days.trim();
  if (!trimmed) {
    return "Die Logfiles werden nach Ablauf der beim Hosting-Anbieter eingestellten Frist automatisch gelöscht.";
  }
  return `Die Logfiles werden nach ${trimmed} Tagen automatisch gelöscht, sofern sie nicht zur Aufklärung einer konkreten Störung oder eines Missbrauchs länger benötigt werden.`;
}

export function buildDatenschutz(profile: LegalProfile, audit: SiteAudit, look: SiteLook): BaseBlock[] {
  const body: BaseBlock[] = [];

  body.push(h(look, "Datenschutzerklärung", 1));
  body.push(space(12));
  body.push(
    p(
      look,
      "Wir freuen uns über Ihren Besuch auf dieser Website. Nachfolgend informieren wir Sie darüber, " +
        "welche personenbezogenen Daten dabei verarbeitet werden, zu welchem Zweck das geschieht und " +
        "welche Rechte Ihnen zustehen.",
      look.textColor,
      "lg",
    ),
  );

  // — Art. 13 Abs. 1 lit. a DSGVO —
  body.push(space(32));
  body.push(h(look, "1. Verantwortlicher", 2));
  body.push(space(12));
  body.push(p(look, "Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website ist:"));
  body.push(space(12));
  body.push(
    stacked(
      look,
      lines(
        profile.companyName,
        ...addressLines(profile.address),
        profile.phone && `Telefon: ${profile.phone}`,
        profile.email && `E-Mail: ${profile.email}`,
      ),
    ),
  );

  let section = 2;
  const next = () => section++;

  // — Art. 13 Abs. 1 lit. b DSGVO —
  if (profile.hasDpo && (profile.dpoName || profile.dpoEmail)) {
    body.push(space(32));
    body.push(h(look, `${next()}. Datenschutzbeauftragte:r`, 2));
    body.push(space(12));
    const dpoAddress = profile.dpoAddressSameAsProvider ? profile.address : profile.dpoAddress;
    body.push(
      stacked(look, lines(profile.dpoName, ...addressLines(dpoAddress), profile.dpoEmail && `E-Mail: ${profile.dpoEmail}`)),
    );
  }

  // — hosting and server logs: Art. 6 Abs. 1 lit. f, Art. 28 —
  body.push(space(32));
  body.push(h(look, `${next()}. Hosting und Server-Logfiles`, 2));
  body.push(space(12));
  body.push(
    p(
      look,
      profile.hostingProvider.trim()
        ? `Diese Website wird bei ${profile.hostingProvider.trim()} gehostet${
            profile.hostingAddress.trim() ? ` (${profile.hostingAddress.trim()})` : ""
          }. Beim Aufruf einer Seite erhebt der Hosting-Anbieter automatisch Daten, die Ihr Browser übermittelt, und speichert sie in sogenannten Server-Logfiles:`
        : "Beim Aufruf einer Seite erhebt der Hosting-Anbieter automatisch Daten, die Ihr Browser übermittelt, und speichert sie in sogenannten Server-Logfiles:",
    ),
  );
  body.push(space(12));
  body.push(
    bullets([
      "die aufgerufene Seite und die übertragene Datenmenge",
      "Datum und Uhrzeit des Abrufs",
      "der verwendete Browser und dessen Version",
      "das Betriebssystem Ihres Geräts",
      "die zuvor besuchte Seite (Referrer), sofern Ihr Browser sie übermittelt",
      "Ihre IP-Adresse",
    ]),
  );
  body.push(space(12));
  body.push(
    p(
      look,
      "Diese Daten sind technisch erforderlich, um die Seite auszuliefern, ihre Stabilität und " +
        "Sicherheit zu gewährleisten und Missbrauch nachvollziehen zu können. Rechtsgrundlage ist " +
        "unser berechtigtes Interesse am sicheren Betrieb dieser Website gemäß Art. 6 Abs. 1 lit. f " +
        "DSGVO. Eine Zusammenführung dieser Daten mit anderen Datenquellen findet nicht statt.",
    ),
  );
  body.push(space(12));
  body.push(p(look, logRetention(profile.logRetentionDays)));
  // Only when the operator has said so. This used to default to true, so a
  // profile with just the required fields filled in asserted a contract
  // nobody had been asked about.
  if (profile.hostingProvider.trim() && profile.hostingDpa === "yes") {
    body.push(space(12));
    body.push(
      p(
        look,
        "Mit dem Hosting-Anbieter besteht ein Vertrag über die Verarbeitung im Auftrag gemäß " +
          "Art. 28 DSGVO. Der Anbieter verarbeitet die Daten ausschließlich nach unserer Weisung.",
      ),
    );
  }

  // — contact, by email and by any form the audit actually found —
  body.push(space(32));
  body.push(h(look, `${next()}. Kontaktaufnahme`, 2));
  body.push(space(12));
  body.push(
    p(
      look,
      "Wenn Sie uns per E-Mail oder telefonisch kontaktieren, verarbeiten wir die von Ihnen " +
        "mitgeteilten Daten, um Ihre Anfrage zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b " +
        "DSGVO, wenn Ihre Anfrage der Anbahnung oder Durchführung eines Vertrages dient, im Übrigen " +
        "unser berechtigtes Interesse an der Beantwortung von Anfragen gemäß Art. 6 Abs. 1 lit. f DSGVO.",
    ),
  );

  if (audit.hasForm) {
    body.push(space(16));
    /**
     * What the form actually does, said accurately.
     *
     * The old "none" text told the visitor their input "verlässt Ihren
     * Browser nicht und wird nirgends gespeichert". That was wrong twice
     * over: on a builder-served page the form posts every answer to
     * /api/submissions and stores it, and on the exported page — where the
     * script is stripped and the <form> has no action — pressing Send is a
     * native GET that puts every field into the URL and the host's access
     * log. Neither of those is "nowhere".
     */
    body.push(
      p(
        look,
        formHandling(profile.formFate),
      ),
    );
    if (profile.formFate !== "none" && profile.formRetention.trim()) {
      body.push(space(12));
      body.push(p(look, `Aufbewahrung: ${profile.formRetention.trim()}`));
    }
  }

  // — cookies and terminal equipment: § 25 TDDDG —
  body.push(space(32));
  body.push(h(look, `${next()}. Cookies und Zugriff auf Ihr Endgerät`, 2));
  body.push(space(12));
  body.push(
    audit.selfContained
      ? p(
          look,
          "Diese Website setzt keine Cookies, verwendet keine Analyse- oder Trackingdienste und " +
            "speichert keine Informationen auf Ihrem Endgerät. Eine Einwilligung nach § 25 Abs. 1 " +
            "TDDDG ist daher nicht erforderlich.",
        )
      : p(
          look,
          "Diese Website selbst setzt keine Cookies und verwendet keine Analyse- oder " +
            "Trackingdienste. Eingebundene Inhalte Dritter können jedoch Informationen auf Ihrem " +
            "Endgerät speichern oder darauf zugreifen; Näheres dazu im folgenden Abschnitt.",
        ),
  );

  // — third-party content, only when there is some —
  if (!audit.selfContained) {
    body.push(space(32));
    body.push(h(look, `${next()}. Eingebundene Inhalte Dritter`, 2));
    body.push(space(12));
    body.push(
      p(
        look,
        "Auf dieser Website sind Inhalte eingebunden, die von den Servern Dritter geladen werden. " +
          "Beim Aufruf der betreffenden Seite übermittelt Ihr Browser Ihre IP-Adresse an den jeweiligen " +
          "Anbieter; ohne diese Übermittlung könnte der Inhalt nicht angezeigt werden. Auf die weitere " +
          "Verarbeitung durch den Anbieter haben wir keinen Einfluss. Es handelt sich um:",
      ),
    );
    body.push(space(12));
    body.push(bullets(audit.remoteHosts));
    // A bare host name says where the data goes and not to whom. For the
    // services a Neuravex block embeds by itself — a video pasted as a
    // YouTube or Vimeo link, a map shown as an OpenStreetMap frame — the
    // provider is known, so the notice names it and what the visitor's
    // browser does there, rather than leaving a reader to look up
    // `www.youtube-nocookie.com`.
    for (const provider of KNOWN_PROVIDERS) {
      if (provider.hosts.some((host) => audit.remoteHosts.includes(host))) {
        body.push(space(12));
        body.push(p(look, provider.text));
      }
    }
    body.push(space(12));
    body.push(
      p(
        look,
        "Rechtsgrundlage ist, soweit Sie eingewilligt haben, Art. 6 Abs. 1 lit. a DSGVO in " +
          "Verbindung mit § 25 Abs. 1 TDDDG, im Übrigen unser berechtigtes Interesse an einer " +
          "ansprechenden Darstellung unseres Angebots gemäß Art. 6 Abs. 1 lit. f DSGVO.",
      ),
    );
  }

  // — Art. 13 Abs. 2 lit. b DSGVO —
  body.push(space(32));
  body.push(h(look, `${next()}. Ihre Rechte`, 2));
  body.push(space(12));
  body.push(p(look, "Ihnen stehen gegenüber uns die folgenden Rechte hinsichtlich Ihrer personenbezogenen Daten zu:"));
  body.push(space(12));
  body.push(bullets(RIGHTS));
  body.push(space(12));
  body.push(
    p(
      look,
      profile.email.trim()
        ? `Zur Ausübung dieser Rechte genügt eine formlose Nachricht an ${profile.email.trim()}.`
        : "Zur Ausübung dieser Rechte genügt eine formlose Nachricht an die oben genannte Adresse.",
    ),
  );

  // — Art. 77 DSGVO —
  body.push(space(16));
  body.push(
    p(
      look,
      profile.dataAuthority.trim()
        ? `Unabhängig davon steht Ihnen ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu. Für uns zuständig ist: ${[
            profile.dataAuthority.trim(),
            profile.dataAuthorityUrl.trim(),
          ]
            .filter(Boolean)
            .join(", ")}`
        : "Unabhängig davon steht Ihnen ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu, insbesondere bei der Aufsichtsbehörde des Bundeslandes Ihres gewöhnlichen Aufenthalts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes.",
    ),
  );

  // — Art. 21 Abs. 4 DSGVO: separately, and in its own words —
  body.push(space(32));
  body.push(h(look, `${next()}. Widerspruchsrecht gegen die Datenverarbeitung`, 2));
  body.push(space(12));
  body.push(p(look, OBJECTION));

  body.push(space(32));
  body.push(h(look, `${next()}. Verschlüsselung`, 2));
  body.push(space(12));
  body.push(
    p(
      look,
      "Diese Website sollte ausschließlich über eine mit SSL/TLS verschlüsselte Verbindung " +
        "aufgerufen werden. Sie erkennen eine verschlüsselte Verbindung daran, dass die Adresszeile " +
        "Ihres Browsers mit „https://“ beginnt. Bei einer verschlüsselten Verbindung können die " +
        "Daten, die Sie an uns übermitteln, nicht von Dritten mitgelesen werden.",
    ),
  );

  body.push(space(32));
  body.push(
    p(
      look,
      "Wir passen diese Datenschutzerklärung an, sobald Änderungen an dieser Website oder an der " +
        "Rechtslage dies erfordern.",
      look.mutedColor,
      "sm",
    ),
  );

  return [legalSection(look, body)];
}

/** The sentence describing what happens to a form submission. */
function formHandling(fate: string): string {
  switch (fate) {
    case "email":
      return "Senden Sie uns ein Formular auf dieser Website, werden die darin eingegebenen Daten an unsere E-Mail-Adresse übermittelt und dort verarbeitet.";
    case "stored":
      return "Senden Sie uns ein Formular auf dieser Website, werden die darin eingegebenen Daten bei unserem Hosting-Anbieter gespeichert und von uns dort abgerufen.";
    case "builder":
      return (
        "Senden Sie uns ein Formular auf dieser Website, werden die darin eingegebenen Daten an " +
        "unseren Server übermittelt und dort gespeichert, damit wir Ihre Anfrage bearbeiten können."
      );
    case "none":
      return (
        "Das auf dieser Website eingebundene Formular ist nicht an eine Verarbeitung angebunden. " +
        "Je nachdem, wie diese Seite ausgeliefert wird, können Ihre Eingaben beim Absenden " +
        "dennoch in der Adresszeile und damit in den Server-Protokollen unseres Hosting-Anbieters " +
        "erscheinen. Bitte senden Sie uns vertrauliche Angaben stattdessen per E-Mail."
      );
    default:
      // Unanswered. `missingFor()` refuses to generate in that state, so this
      // is only reachable through a profile edited outside the wizard.
      return (
        "Wie die über dieses Formular eingegebenen Daten verarbeitet werden, ist an dieser Stelle " +
        "noch nicht angegeben. Bitte wenden Sie sich für Auskünfte an die oben genannte Adresse."
      );
  }
}

/**
 * Who is behind the hosts the builder's own blocks embed, in the notice's
 * words. Only services a block produces by itself are here: a host found in
 * somebody's custom HTML is still listed, by name, in the bullets above.
 * Providers' addresses as published in their own privacy notices; they are
 * facts about the provider, not claims about this site, and they are part of
 * what the qualified review in `docs/LAUNCH_CHECKLIST.md` §7 has to read.
 */
const KNOWN_PROVIDERS: { hosts: string[]; text: string }[] = [
  {
    hosts: ["www.youtube-nocookie.com", "youtube-nocookie.com"],
    text:
      "YouTube: Videos werden im erweiterten Datenschutzmodus von YouTube eingebunden. Anbieter ist " +
      "die Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. In diesem Modus " +
      "speichert YouTube nach eigenen Angaben erst dann Informationen auf Ihrem Endgerät, wenn Sie " +
      "das Video abspielen; eine Übermittlung von Daten an die Google LLC in den USA ist dabei nicht " +
      "auszuschließen. Weitere Informationen: https://policies.google.com/privacy",
  },
  {
    hosts: ["player.vimeo.com"],
    text:
      "Vimeo: Videos werden über den Player von Vimeo eingebunden, mit der Einstellung, die Vimeo " +
      "anweist, Ihr Nutzungsverhalten nicht zu verfolgen („Do Not Track“). Anbieter ist die " +
      "Vimeo.com, Inc., 330 West 34th Street, 5th Floor, New York, NY 10001, USA; Ihre Daten werden " +
      "dabei in die USA übermittelt. Weitere Informationen: https://vimeo.com/privacy",
  },
  {
    hosts: ["www.openstreetmap.org", "tile.openstreetmap.org"],
    text:
      "OpenStreetMap: Karten werden vom Dienst OpenStreetMap eingebunden. Anbieter ist die " +
      "OpenStreetMap Foundation, St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, " +
      "Vereinigtes Königreich. Ihr Browser lädt die Karte und ihre Kartenausschnitte von dort; für " +
      "das Vereinigte Königreich besteht ein Angemessenheitsbeschluss der Europäischen Kommission. " +
      "Weitere Informationen: https://osmfoundation.org/wiki/Privacy_Policy",
  },
];
