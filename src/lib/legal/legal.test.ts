import { describe, it, expect } from "vitest";
import { BaseBlock } from "@/types";
import {
  defaultRegisterKind,
  emptyProfile,
  isComplete,
  legalForm,
  missingFor,
  parseProfile,
  type LegalProfile,
} from "./profile";
import { auditSite, remoteHost } from "./audit";
import { buildLegalPages, isLegalKind } from "./pages";
import { DEFAULT_LOOK } from "../page-starters";
import { buildImpressum } from "./impressum";
import { buildDatenschutz } from "./datenschutz";

/** Every word a built document puts on the page, in order. */
function text(blocks: BaseBlock[]): string {
  const out: string[] = [];
  const walk = (list: BaseBlock[]) => {
    for (const b of list) {
      if (typeof b.props?.text === "string") out.push(b.props.text);
      if (Array.isArray(b.props?.items)) out.push(...b.props.items);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return out.join("\n");
}

const gmbh = (over: Partial<LegalProfile> = {}): LegalProfile => ({
  ...emptyProfile(),
  legalForm: "gmbh",
  companyName: "Muster GmbH",
  representatives: ["Erika Mustermann"],
  address: { street: "Musterstraße 1", extra: "", postalCode: "10115", city: "Berlin", country: "Deutschland" },
  email: "kontakt@muster.de",
  phone: "+49 30 1234567",
  registerKind: "hrb",
  registerCourt: "Amtsgericht Berlin-Charlottenburg",
  registerNumber: "HRB 123456",
  hostingProvider: "Hetzner Online GmbH",
  // Both of these used to have a default standing in for an answer. The
  // fixture states them, because a complete profile is one where somebody has.
  hostingDpa: "yes",
  formFate: "builder",
  formRetention: "bis zur abschließenden Bearbeitung",
  ...over,
});

const emptyAudit = { findings: [], hasForm: false, remoteHosts: [], linkHosts: [], formHosts: [], selfContained: true };

describe("what the law asks of whom", () => {
  it("asks a GmbH for its representatives and its register, and a sole trader for neither", () => {
    const sole = { ...emptyProfile(), companyName: "Erika Mustermann", legalForm: "einzelunternehmen" };
    const fields = missingFor(sole).map((m) => m.field);
    expect(fields).not.toContain("representatives");
    expect(fields).not.toContain("registerNumber");

    const company = { ...emptyProfile(), companyName: "Muster GmbH", legalForm: "gmbh" };
    const companyFields = missingFor(company).map((m) => m.field);
    expect(companyFields).toContain("representatives");
    expect(companyFields).toContain("registerNumber");
  });

  it("takes a telephone number or a contact form as the second route, not both", () => {
    const base = gmbh({ phone: "", contactPagePath: "" });
    expect(missingFor(base).map((m) => m.field)).toContain("phone");
    expect(missingFor({ ...base, phone: "+49 30 1" }).map((m) => m.field)).not.toContain("phone");
    expect(missingFor({ ...base, contactPagePath: "/sites/x/kontakt" }).map((m) => m.field)).not.toContain("phone");
  });

  it("only asks about a chamber once the profession is said to be regulated", () => {
    expect(missingFor(gmbh()).map((m) => m.field)).not.toContain("professionChamber");
    expect(missingFor(gmbh({ regulatedProfession: true })).map((m) => m.field)).toContain("professionChamber");
  });

  it("only asks who is editorially responsible once there is editorial content", () => {
    expect(missingFor(gmbh()).map((m) => m.field)).not.toContain("editorialResponsible");
    expect(missingFor(gmbh({ editorialContent: true })).map((m) => m.field)).toContain("editorialResponsible");
  });

  it("names a provision for everything it asks for", () => {
    for (const m of missingFor(emptyProfile())) {
      expect(m.label, m.field).toMatch(/§|Art\./);
    }
  });

  it("is complete once the facts are there", () => {
    expect(isComplete(gmbh())).toBe(true);
  });

  it("reads a stored profile back, and survives one that is not readable", () => {
    const stored = JSON.stringify(gmbh());
    expect(parseProfile(stored).companyName).toBe("Muster GmbH");
    expect(parseProfile("{not json").companyName).toBe("");
    expect(parseProfile(null).legalForm).toBe("einzelunternehmen");
  });

  it("puts a legal form in the register it actually belongs to", () => {
    expect(defaultRegisterKind("gmbh")).toBe("hrb");
    expect(defaultRegisterKind("ohg")).toBe("hra");
    expect(defaultRegisterKind("ev")).toBe("vr");
    expect(defaultRegisterKind("einzelunternehmen")).toBe("");
    expect(legalForm("nonsense").id).toBe("sonstige");
  });
});

describe("the Impressum", () => {
  it("names the provider, the representatives and the address", () => {
    const out = text(buildImpressum(gmbh(), DEFAULT_LOOK));
    expect(out).toContain("Angaben gemäß § 5 DDG");
    expect(out).toContain("Muster GmbH");
    expect(out).toContain("Vertreten durch: Erika Mustermann");
    expect(out).toContain("Musterstraße 1");
    expect(out).toContain("10115 Berlin");
  });

  it("names the register the way the register is named", () => {
    const out = text(buildImpressum(gmbh(), DEFAULT_LOOK));
    expect(out).toContain("Eintragung im Handelsregister B");
    expect(out).toContain("Registergericht: Amtsgericht Berlin-Charlottenburg");
    expect(out).toContain("Registernummer: HRB 123456");
  });

  it("leaves out a register a sole trader does not have", () => {
    const sole = gmbh({ legalForm: "einzelunternehmen", registerNumber: "HRB 1", registerCourt: "AG Berlin" });
    expect(text(buildImpressum(sole, DEFAULT_LOOK))).not.toContain("Registereintrag");
  });

  it("states a VAT ID only when there is one to state", () => {
    expect(text(buildImpressum(gmbh(), DEFAULT_LOOK))).not.toContain("Umsatzsteuer");
    expect(text(buildImpressum(gmbh({ vatId: "DE123456789" }), DEFAULT_LOOK))).toContain(
      "Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: DE123456789",
    );
  });

  it("always says something about consumer arbitration, because § 36 VSBG wants a statement either way", () => {
    expect(text(buildImpressum(gmbh(), DEFAULT_LOOK))).toContain("nicht bereit und nicht verpflichtet");
    const taking = gmbh({ disputeStance: "obliged", disputeBoardName: "Universalschlichtungsstelle des Bundes" });
    expect(text(buildImpressum(taking, DEFAULT_LOOK))).toContain("Universalschlichtungsstelle des Bundes");
  });

  it("does not send anyone to the EU dispute platform", () => {
    // Regulation (EU) 2024/3228 repealed the ODR Regulation and the platform
    // shut down on 20 July 2025. Generators that still emit the link point at
    // a dead page and claim a duty that no longer exists.
    const out = text(buildImpressum(gmbh({ disputeStance: "voluntary", disputeBoardName: "X" }), DEFAULT_LOOK));
    expect(out).not.toMatch(/ec\.europa\.eu\/consumers\/odr/i);
    expect(out).not.toMatch(/Online-Streitbeilegung/i);
  });

  it("writes no liability disclaimer, which no provision asks for", () => {
    const out = text(buildImpressum(gmbh(), DEFAULT_LOOK));
    expect(out).not.toMatch(/Haftung für Inhalte|Haftung für Links|Urheberrecht/);
  });

  it("names the responsible person under § 18 Abs. 2 MStV once there is editorial content", () => {
    const out = text(buildImpressum(gmbh({ editorialContent: true, editorialResponsible: "Erika Mustermann" }), DEFAULT_LOOK));
    expect(out).toContain("§ 18 Abs. 2 MStV");
    expect(out).toContain("Erika Mustermann");
  });
});

describe("the Datenschutzerklärung", () => {
  it("names the controller and the rights, with their articles", () => {
    const out = text(buildDatenschutz(gmbh(), emptyAudit, DEFAULT_LOOK));
    expect(out).toContain("Verantwortlicher");
    expect(out).toContain("Muster GmbH");
    for (const article of ["Art. 15", "Art. 16", "Art. 17", "Art. 18", "Art. 20", "Art. 7 Abs. 3", "Art. 77"]) {
      expect(out, article).toContain(article);
    }
  });

  it("keeps the Art. 21 objection notice in a section of its own", () => {
    // Art. 21 Abs. 4 asks for it "in einer verständlichen und von anderen
    // Informationen getrennten Form", which a bullet in a list is not.
    const blocks = buildDatenschutz(gmbh(), emptyAudit, DEFAULT_LOOK);
    const headings: string[] = [];
    const walk = (list: BaseBlock[]) => {
      for (const b of list) {
        if (b.type === "heading") headings.push(String(b.props.text));
        if (b.children) walk(b.children);
      }
    };
    walk(blocks);
    expect(headings.some((h) => h.includes("Widerspruchsrecht"))).toBe(true);
  });

  it("says the site sets no cookies when nothing on it reaches outside the browser", () => {
    const out = text(buildDatenschutz(gmbh(), emptyAudit, DEFAULT_LOOK));
    expect(out).toContain("setzt keine Cookies");
    expect(out).not.toContain("Eingebundene Inhalte Dritter");
  });

  it("describes third-party content only when there is some, and names the hosts", () => {
    const audit = {
      findings: [],
      hasForm: false,
      remoteHosts: ["fonts.googleapis.com", "www.youtube.com"],
      linkHosts: [],
      formHosts: [],
      selfContained: false,
    };
    const out = text(buildDatenschutz(gmbh(), audit, DEFAULT_LOOK));
    expect(out).toContain("Eingebundene Inhalte Dritter");
    expect(out).toContain("fonts.googleapis.com");
    expect(out).toContain("§ 25 Abs. 1 TDDDG");
  });

  it("describes what the form actually does with an answer", () => {
    const audit = { ...emptyAudit, hasForm: true };

    const stored = text(buildDatenschutz(gmbh(), audit, DEFAULT_LOOK));
    expect(stored).toContain("an unseren Server übermittelt und dort gespeichert");

    const emailed = text(buildDatenschutz(gmbh({ formFate: "email" as const, formRetention: "6 Monate" }), audit, DEFAULT_LOOK));
    expect(emailed).toContain("an unsere E-Mail-Adresse übermittelt");
    expect(emailed).toContain("6 Monate");
  });

  it("no longer promises that an unwired form keeps everything in the browser", () => {
    // The old text said input "verlässt Ihren Browser nicht und wird nirgends
    // gespeichert". On a builder-served page the form posts to
    // /api/submissions; on the exported page the script is stripped and the
    // <form> has no action, so Send is a native GET that puts every field
    // into the URL and the host's access log.
    const audit = { ...emptyAudit, hasForm: true };
    const out = text(buildDatenschutz(gmbh({ formFate: "none" as const }), audit, DEFAULT_LOOK));
    expect(out).not.toContain("verlassen Ihren Browser nicht");
    expect(out).not.toContain("nirgends gespeichert");
    expect(out).toContain("Adresszeile");
  });

  it("says nothing about a processing agreement nobody was asked about", () => {
    const out = text(buildDatenschutz(gmbh({ hostingDpa: "" as const }), emptyAudit, DEFAULT_LOOK));
    expect(out).not.toContain("Art. 28 DSGVO");
  });

  it("does not claim a processing agreement it was told there is none of", () => {
    const out = text(buildDatenschutz(gmbh({ hostingDpa: "no" }), emptyAudit, DEFAULT_LOOK));
    expect(out).not.toContain("Art. 28 DSGVO");
  });

  it("numbers its sections without gaps whichever ones apply", () => {
    for (const profile of [gmbh(), gmbh({ hasDpo: true, dpoName: "D", dpoEmail: "d@x.de" })]) {
      for (const audit of [emptyAudit, { ...emptyAudit, selfContained: false, remoteHosts: ["a.example"] }]) {
        const headings = text(buildDatenschutz(profile, audit, DEFAULT_LOOK))
          .split("\n")
          .filter((l) => /^\d+\. /.test(l))
          .map((l) => Number(l.split(".")[0]));
        expect(headings).toEqual(headings.map((_, i) => i + 1));
      }
    }
  });
});

describe("what the site itself does", () => {
  const page = (blocks: unknown[]) => ({ title: "Home", content: JSON.stringify(blocks) });

  it("tells an address on this site from one somewhere else", () => {
    expect(remoteHost("/stock/a.jpg")).toBeNull();
    expect(remoteHost("#top")).toBeNull();
    expect(remoteHost("data:image/png;base64,xx")).toBeNull();
    expect(remoteHost("https://images.unsplash.com/a.jpg")).toBe("images.unsplash.com");
    expect(remoteHost("//fonts.gstatic.com/x.woff2")).toBe("fonts.gstatic.com");
    expect(remoteHost("mailto:a@b.de")).toBeNull();
  });

  it("finds a form wherever it is nested", () => {
    const audit = auditSite({
      pages: [
        page([
          { id: "s", type: "section", props: {}, children: [{ id: "c", type: "columns", props: {}, children: [{ id: "f", type: "form", props: {} }] }] },
        ]),
      ],
    });
    expect(audit.hasForm).toBe(true);
  });

  it("finds a picture served from somebody else's domain", () => {
    const audit = auditSite({ pages: [page([{ id: "i", type: "image", props: { src: "https://images.unsplash.com/a.jpg" } }])] });
    expect(audit.remoteHosts).toEqual(["images.unsplash.com"]);
    expect(audit.selfContained).toBe(false);
  });

  it("finds a picture behind a section and behind one column", () => {
    const audit = auditSite({
      pages: [
        page([
          { id: "s", type: "section", props: { backgroundImage: "https://a.example/x.jpg" } },
          { id: "c", type: "columns", props: { columnStyles: [{ backgroundImage: "https://b.example/y.jpg" }] } },
        ]),
      ],
    });
    expect(audit.remoteHosts).toEqual(["a.example", "b.example"]);
  });

  it("finds an embed pasted into a custom HTML block", () => {
    const audit = auditSite({
      pages: [page([{ id: "h", type: "html", props: { html: '<iframe src="https://www.youtube.com/embed/x"></iframe>' } }])],
    });
    expect(audit.remoteHosts).toEqual(["www.youtube.com"]);
    expect(audit.findings.some((f) => f.kind === "embed" && f.needsConsent)).toBe(true);
  });

  it("looks at the site's own header and footer HTML too", () => {
    const audit = auditSite({
      pages: [page([])],
      footerHtml: '<img src="https://tracker.example/pixel.gif">',
    });
    expect(audit.remoteHosts).toEqual(["tracker.example"]);
  });

  it("calls a site that reaches nowhere self-contained", () => {
    const audit = auditSite({ pages: [page([{ id: "i", type: "image", props: { src: "/stock/nature/a.jpg" } }])] });
    expect(audit.selfContained).toBe(true);
    expect(audit.remoteHosts).toEqual([]);
  });

  it("does not read the legal pages back when working out what the site does", () => {
    // They are generated from the audit, so counting them would let last
    // run's output decide what this run says.
    const built = buildLegalPages(gmbh(), {
      pages: [
        { title: "Home", content: JSON.stringify([{ id: "i", type: "image", props: { src: "/stock/a.jpg" } }]), legalKind: null },
        { title: "Impressum", content: JSON.stringify([{ id: "i", type: "image", props: { src: "https://x.example/a.jpg" } }]), legalKind: "impressum" },
      ],
    });
    expect(built.audit.selfContained).toBe(true);
  });

  it("knows which pages it owns", () => {
    expect(isLegalKind("impressum")).toBe(true);
    expect(isLegalKind("datenschutz")).toBe(true);
    expect(isLegalKind("about")).toBe(false);
    expect(isLegalKind(null)).toBe(false);
  });
});

describe("the pages that come out", () => {
  it("wear the look of the site they are added to", () => {
    const home = JSON.stringify([
      {
        id: "s",
        type: "section",
        props: { background: "#101010", paddingY: 112, paddingX: 40, maxWidth: "site", align: "center" },
        children: [{ id: "h", type: "heading", props: { text: "Hi", level: 1, color: "#fafafa" } }],
      },
    ]);
    const built = buildLegalPages(gmbh(), { pages: [{ title: "Home", content: home, legalKind: null }] });
    const section = JSON.parse(built.pages.impressum)[0];
    expect(section.props.background).toBe("#101010");
    // A document is read in a column, left-aligned, whatever the site's pages do.
    expect(section.props.maxWidth).toBe("4xl");
    expect(section.props.align).toBe("left");
  });

  it("keep a real heading outline while being set at reading size", () => {
    const built = buildLegalPages(gmbh(), { pages: [{ title: "Home", content: "[]", legalKind: null }] });
    const headings: BaseBlock[] = [];
    const walk = (list: BaseBlock[]) => {
      for (const b of list) {
        if (b.type === "heading") headings.push(b);
        if (b.children) walk(b.children);
      }
    };
    walk(JSON.parse(built.pages.impressum));
    expect(headings[0].props.level).toBe(1);
    expect(headings[0].props.size).toBe(2);
    expect(headings[1].props.level).toBe(2);
    expect(headings[1].props.size).toBe(4);
  });
});

describe("the audit looks where content actually is", () => {
  const page = (blocks: unknown[]) => ({ title: "Home", content: JSON.stringify(blocks) });

  it("reads the sanitised form, which is what the browser is handed", () => {
    // A tracker `<img>` written into a Text block used to load on every page
    // view and never reach the audit, so an otherwise self-contained site
    // declared that nothing is loaded from third parties. The inline-text
    // profile drops `img` outright now, so nothing loads and the audit's
    // silence is the truth rather than a blind spot.
    const audit = auditSite({
      pages: [page([{ id: "t", type: "text", props: { text: '<img src="https://tracker.example/p.gif">hello' } }])],
    });
    expect(audit.remoteHosts).toEqual([]);
    expect(audit.selfContained).toBe(true);
  });

  it("finds a link written into a rich-text prop, as a link", () => {
    const audit = auditSite({
      pages: [page([{ id: "t", type: "text", props: { text: '<a href="https://instagram.com/x">us</a>' } }])],
    });
    expect(audit.linkHosts).toEqual(["instagram.com"]);
    // Followed on a click, so nothing is transmitted when the page opens.
    expect(audit.remoteHosts).toEqual([]);
    expect(audit.selfContained).toBe(true);
  });

  it("finds a picture a block points at somebody else's server", () => {
    const audit = auditSite({
      pages: [page([{ id: "i", type: "image", props: { src: "https://cdn.example/a.png" } }])],
    });
    expect(audit.remoteHosts).toEqual(["cdn.example"]);
  });

  it("finds an unquoted attribute value in custom HTML", () => {
    // The regex this replaces wanted quotes around the value. The sanitiser
    // normalises it and the browser loads it.
    const audit = auditSite({
      pages: [page([{ id: "h", type: "html", props: { html: "<img src=https://unquoted.example/p.gif>" } }])],
    });
    expect(audit.remoteHosts).toContain("unquoted.example");
  });

  it("finds an embed, and reports it as one", () => {
    const audit = auditSite({
      pages: [
        page([
          { id: "h", type: "html", props: { html: '<iframe src="https://www.youtube.com/embed/x"></iframe>' } },
        ]),
      ],
    });
    expect(audit.findings.some((f) => f.kind === "embed")).toBe(true);
    expect(audit.remoteHosts).toContain("www.youtube.com");
  });

  it("does not report a footer hyperlink as something loaded on page open", () => {
    // A footer link to instagram.com used to produce a "chrome-remote"
    // finding, make the site not self-contained, and put a paragraph in the
    // notice saying the visitor's IP is transmitted when the page loads.
    const audit = auditSite({ pages: [], footerHtml: '<a href="https://instagram.com/x">Instagram</a>' });
    expect(audit.remoteHosts).toEqual([]);
    expect(audit.selfContained).toBe(true);
    expect(audit.linkHosts).toEqual(["instagram.com"]);
  });

  it("walks a deeply nested tree without running out of stack", () => {
    // About 8000 levels used to overflow here: a 500 on the legal panel with
    // nothing to click past. Built as text, because JSON.stringify would
    // overflow on the way in.
    const depth = 9000;
    const open = '[{"id":"s","type":"section","props":{},"children":';
    const content = open.repeat(depth) + '[{"id":"t","type":"text","props":{"text":"deep"}}]' + "}]".repeat(depth);
    expect(() => auditSite({ pages: [{ title: "Home", content }] })).not.toThrow();
  });
});
