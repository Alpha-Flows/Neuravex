import { describe, it, expect } from "vitest";
import { normalizeBlockTree, allowedValues } from "@/lib/block-tree";
import {
  FORM_FIELD_TYPES,
  answersFrom,
  consentLabel,
  destinationHost,
  destinationKind,
  destinationSource,
  formDestination,
  formOptions,
  newField,
  submissionKeys,
} from "@/lib/form-fields";

/** A form block's props after the validator has read them. */
function stored(props: Record<string, unknown>) {
  const result = normalizeBlockTree([{ id: "f", type: "form", props }]);
  if (!result.ok) throw new Error(result.error);
  return result.tree[0].props;
}

describe("a form's fields, as stored", () => {
  it("keeps every kind a browser knows how to ask for", () => {
    expect(allowedValues("form")["fields[].type"]).toEqual([...FORM_FIELD_TYPES]);
    const fields = FORM_FIELD_TYPES.map((type) => ({ label: type, type, required: false }));
    expect(stored({ fields }).fields.map((f: { type: string }) => f.type)).toEqual([...FORM_FIELD_TYPES]);
  });

  it("keeps an old three-field form exactly as it was", () => {
    const fields = [
      { label: "Name", type: "text", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Message", type: "textarea", required: false },
    ];
    expect(stored({ fields }).fields).toEqual(fields);
  });

  it("gives a choice something to choose from, and nothing else a list", () => {
    const { fields } = stored({
      fields: [
        { label: "Topic", type: "select", required: true },
        { label: "Email", type: "email", required: false, options: ["a", "b"] },
      ],
    });
    expect(fields[0].options).toEqual(["Option 1", "Option 2"]);
    expect(fields[1]).not.toHaveProperty("options");
  });

  it("cleans the options: trimmed, each once, text only", () => {
    expect(formOptions([" Tuesday ", "Tuesday", "", 7, "Thursday"])).toEqual(["Tuesday", "Thursday"]);
    expect(formOptions(Array.from({ length: 80 }, (_, i) => `o${i}`))).toHaveLength(50);
    expect(formOptions("Tuesday")).toEqual([]);
  });

  it("keeps a placeholder only where one can be shown", () => {
    const { fields } = stored({
      fields: [
        { label: "Phone", type: "tel", required: false, placeholder: "+49 …" },
        { label: "When", type: "date", required: false, placeholder: "tomorrow" },
      ],
    });
    expect(fields[0].placeholder).toBe("+49 …");
    expect(fields[1]).not.toHaveProperty("placeholder");
  });

  it("stores a label as inline HTML, with a link and without a script", () => {
    const { fields } = stored({
      fields: [{ label: 'Ich habe die <a href="/sites/a/datenschutz">Datenschutzerklärung</a> gelesen<script>x</script>', type: "consent", required: true }],
    });
    expect(fields[0].label).toBe('Ich habe die <a href="/sites/a/datenschutz">Datenschutzerklärung</a> gelesen');
  });

  it("drops a field that is not one, rather than the form or a blank box", () => {
    const { fields } = stored({ fields: [7, { label: "Name", type: "text", required: true }, null] });
    expect(fields).toEqual([{ label: "Name", type: "text", required: true }]);
  });

  it("repairs a kind it does not know to a line of text", () => {
    expect(stored({ fields: [{ label: "X", type: "colour", required: false }] }).fields[0].type).toBe("text");
  });
});

describe("the key an answer is stored under", () => {
  it("is the label's words, numbered when two are the same", () => {
    expect(submissionKeys([{ label: "Email" }, { label: "Email" }, { label: "<b>Name</b> &amp; address" }])).toEqual([
      "Email",
      "Email 2",
      "Name & address",
    ]);
  });

  it("is not the markup of a privacy checkbox's link", () => {
    expect(submissionKeys([{ label: consentLabel("/sites/a/datenschutz") }])).toEqual([
      "Ich habe die Datenschutzerklärung zur Kenntnis genommen.",
    ]);
  });
});

describe("the answers in a filled-in form", () => {
  it("are read by key, with several choices on one line", () => {
    const fields = [
      { label: "Name", type: "text" as const },
      { label: "Days", type: "checkboxes" as const },
      { label: "Privacy", type: "consent" as const },
      { label: "Size", type: "radio" as const },
    ];
    const form = new FormData();
    form.append("Name", "Ada");
    form.append("Days", "Tuesday");
    form.append("Days", "Thursday");
    form.append("Privacy", "Yes");
    expect(answersFrom(fields, form)).toEqual({ Name: "Ada", Days: "Tuesday, Thursday", Privacy: "Yes", Size: "" });
  });
});

describe("a new field", () => {
  it("starts a privacy checkbox required, and linked to the notice when there is one", () => {
    expect(newField("consent", "/sites/a/datenschutz")).toEqual({
      label: 'Ich habe die <a href="/sites/a/datenschutz">Datenschutzerklärung</a> zur Kenntnis genommen.',
      type: "consent",
      required: true,
    });
    expect(newField("consent").label).not.toContain("<a");
  });

  it("starts a choice with two options to rename", () => {
    expect(newField("radio").options).toEqual(["Option 1", "Option 2"]);
  });
});

describe("where a downloaded form sends its answers", () => {
  it("is a service over https, or one email address", () => {
    expect(formDestination("https://formspree.io/f/abc")).toBe("https://formspree.io/f/abc");
    expect(formDestination("info@example.de")).toBe("mailto:info@example.de");
    expect(formDestination("mailto:info@example.de")).toBe("mailto:info@example.de");
  });

  it("is nowhere for anything else", () => {
    for (const bad of [
      "http://formspree.io/f/abc",
      "javascript:alert(1)",
      "https://user:pass@example.com/",
      "mailto:a@example.de,b@example.de",
      "mailto:a@example.de?bcc=b@example.de",
      "https://localhost/",
      "/api/submissions",
      "",
      7,
    ]) {
      expect(formDestination(bad), String(bad)).toBe("");
    }
  });

  it("is stored cleaned, and left out of the form when it is not one", () => {
    expect(stored({ fields: [], destination: " info@example.de " }).destination).toBe("mailto:info@example.de");
    expect(stored({ fields: [], destination: "javascript:alert(1)" }).destination).toBe("");
  });

  it("opens the downloaded page's policy for its origin, not only its path", () => {
    expect(destinationSource("https://formspree.io/f/abc")).toBe("https://formspree.io");
    expect(destinationSource("mailto:info@example.de")).toBe("mailto:");
    expect(destinationSource("")).toBeNull();
  });

  it("names the service's host for the privacy notice, and no host for email", () => {
    expect(destinationHost("https://formspree.io/f/abc")).toBe("formspree.io");
    expect(destinationHost("mailto:info@example.de")).toBeNull();
    expect(destinationKind("")).toBe("none");
    expect(destinationKind("mailto:info@example.de")).toBe("email");
    expect(destinationKind("https://formspree.io/f/abc")).toBe("service");
  });
});
