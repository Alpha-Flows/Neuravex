import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { BaseBlock, PricingPlan, PricingProps } from "@/types";
import { normalizeBlockTree, safeProps, MAX_PLAN_FEATURES, MAX_PRICING_PLANS } from "@/lib/block-tree";
import { getBlockDefinition } from "@/lib/blocks";
import { movePath, retargetLinks } from "@/lib/page-links";
import { auditSite } from "@/lib/legal/audit";
import { sanitizeInlineHtml } from "@/lib/sanitize";
import {
  editedText,
  featuresFromText,
  featuresToText,
  hasFormatting,
  isBlank,
  newPlan,
  plainText,
  planLabel,
  textToHtml,
} from "@/lib/pricing-plan";

const plan = (over: Record<string, unknown> = {}) => ({
  name: "Pro",
  price: "€29",
  period: "per month",
  description: "For a small team.",
  features: ["Ten projects"],
  buttonLabel: "Choose Pro",
  buttonHref: "#",
  highlighted: false,
  badge: "",
  ...over,
});

/** The props of one pricing block, after the door every write path goes through. */
function stored(props: unknown): PricingProps {
  const result = normalizeBlockTree([{ id: "p", type: "pricing", props }]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.tree[0].props as PricingProps;
}

describe("what a pricing block may hold", () => {
  it("keeps its own defaults exactly as written", () => {
    // `get_block_reference` hands these to agents as the example to copy, so
    // an example the validator rewrites would teach them the wrong shape.
    const defaults = getBlockDefinition("pricing")!.defaultProps;
    expect(stored(defaults)).toEqual(defaults);
  });

  it("cuts a fifth plan and a thirty-first feature rather than refusing the page", () => {
    const features = Array.from({ length: 45 }, (_, i) => `Feature ${i + 1}`);
    const props = stored({ plans: Array.from({ length: 7 }, (_, i) => plan({ name: `Plan ${i + 1}`, features })) });
    expect(props.plans).toHaveLength(MAX_PRICING_PLANS);
    expect(MAX_PRICING_PLANS).toBe(4);
    expect(props.plans.map((p) => p.name)).toEqual(["Plan 1", "Plan 2", "Plan 3", "Plan 4"]);
    for (const p of props.plans) {
      expect(p.features).toHaveLength(MAX_PLAN_FEATURES);
      expect(p.features[29]).toBe("Feature 30");
    }
    expect(MAX_PLAN_FEATURES).toBe(30);
  });

  it("sends a button that would run something to # instead", () => {
    const props = stored({
      plans: [
        plan({ buttonHref: "javascript:alert(document.cookie)" }),
        plan({ buttonHref: " JaVaScRiPt:alert(1)" }),
        plan({ buttonHref: "java\tscript:alert(1)" }),
        plan({ buttonHref: "data:text/html,<script>alert(1)</script>" }),
      ],
    });
    expect(props.plans.map((p) => p.buttonHref)).toEqual(["#", "#", "#", "#"]);
  });

  it("keeps the addresses a button may go to", () => {
    const hrefs = ["https://buy.example/pro", "/sites/acme/contact", "#faq", "mailto:sales@example.com", "tel:+49301234"];
    const props = stored({ plans: hrefs.slice(0, 4).map((buttonHref) => plan({ buttonHref })) });
    expect(props.plans.map((p) => p.buttonHref)).toEqual(hrefs.slice(0, 4));
    expect(stored({ plans: [plan({ buttonHref: hrefs[4] })] }).plans[0].buttonHref).toBe(hrefs[4]);
  });

  it("gives a plan with no link, or a link that is not text, the harmless #", () => {
    const props = stored({ plans: [plan({ buttonHref: undefined }), plan({ buttonHref: 42 }), plan({ buttonHref: "" })] });
    expect(props.plans.map((p) => p.buttonHref)).toEqual(["#", "#", "#"]);
  });

  it("sanitises every piece of text on a card, and keeps the formatting it allows", () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script><b onclick="x()">Pro</b>';
    const props = stored({
      plans: [
        plan({
          name: evil,
          price: evil,
          period: evil,
          description: evil,
          badge: evil,
          buttonLabel: evil,
          features: [evil, '<a href="javascript:alert(3)">Linked</a> and <em>fine</em>'],
        }),
      ],
    });
    const p = props.plans[0];
    for (const text of [p.name, p.price, p.period, p.description, p.badge, p.buttonLabel, ...p.features]) {
      expect(text).not.toMatch(/<img|<script|onerror|onclick|javascript:/i);
    }
    expect(p.name).toBe("<b>Pro</b>");
    expect(p.features[1]).toContain("<em>fine</em>");
  });

  it("drops a plan that is not a record, and keeps the ones around it", () => {
    const props = stored({ plans: [null, "Pro", [plan()], plan({ name: "Kept" })] });
    expect(props.plans.map((p) => p.name)).toEqual(["Kept"]);
    expect(stored({ plans: [plan({ name: "A" }), 42, true, plan({ name: "B" })] }).plans.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("drops a feature that is not text, rather than drawing a tick beside nothing", () => {
    const props = stored({ plans: [plan({ features: ["One", null, 3, { text: "x" }, ["y"], "Two"] })] });
    expect(props.plans[0].features).toEqual(["One", "Two"]);
  });

  it("repairs the rest of a plan field by field", () => {
    const props = stored({
      plans: [{ name: "Only a name", highlighted: "yes", features: "Ten projects", price: 29 }],
      color: "red; background: url(https://tracker.example/x.gif)",
    });
    expect(props.plans[0]).toEqual({
      name: "Only a name",
      price: "",
      period: "",
      description: "",
      features: [],
      buttonLabel: "",
      buttonHref: "#",
      highlighted: false,
      badge: "",
    });
    expect(props.color).toBe("");
  });

  it("reads a list that is not a list as no plans, and still draws", () => {
    expect(stored({ plans: "three" }).plans).toEqual([]);
    expect(stored({}).plans).toEqual([]);
    expect(safeProps("pricing", { plans: { 0: plan() } }, null)).toEqual({ plans: [], color: "" });
  });

  it("keeps a colour of its own", () => {
    expect(stored({ plans: [plan()], color: "#0ea5e9" }).color).toBe("#0ea5e9");
  });

  it("takes the link out of a button's label and keeps its words", () => {
    // The label is drawn inside the plan's own <a>. A link inside it closed
    // the outer one early: the published page failed to hydrate, and in the
    // download the highlighted button was an empty bar above a bare link.
    expect(stored({ plans: [plan({ buttonLabel: '<a href="https://x.example">Go</a>' })] }).plans[0].buttonLabel).toBe("Go");
    const mixed = stored({ plans: [plan({ buttonLabel: 'Choose <a href="/x"><b>Pro</b></a> now' })] }).plans[0].buttonLabel;
    expect(mixed).toBe("Choose <b>Pro</b> now");
    // A row stored before the door checked this is mended where it is drawn.
    const drawn = safeProps<PricingProps>("pricing", { plans: [plan({ buttonLabel: '<a href="#">Go</a>' })] }, { plans: [], color: "" });
    expect(drawn.plans[0].buttonLabel).toBe("Go");
  });

  it("keeps a link written into a feature, which is not inside the button", () => {
    const feature = 'Backed by <a href="https://status.example.com">our uptime</a>';
    expect(stored({ plans: [plan({ features: [feature] })] }).plans[0].features[0]).toContain("<a href=");
  });

  it("measures a feature's length after sanitising, and never cuts an entity in two", () => {
    const feature = stored({ plans: [plan({ features: ["&".repeat(1000)] })] }).plans[0].features[0];
    expect(feature.length).toBeLessThanOrEqual(1000);
    expect(feature.endsWith("&amp;")).toBe(true);
    // A second pass through the door leaves it exactly as it is.
    expect(stored({ plans: [plan({ features: [feature] })] }).plans[0].features[0]).toBe(feature);
  });
});

describe("how the row is drawn", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const region = css.slice(css.indexOf("/* == block: pricing == */"), css.indexOf("/* == end block: pricing == */"));
  const rule = (selector: string) => {
    const at = region.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return region.slice(at, region.indexOf("}", at));
  };

  it("sizes a price from its own card, so a long one is not broken mid-number", () => {
    // At a fixed 2.5rem, "€1,299.00" in a row of four at 1100px came out as
    // "€1,299.0" with a "0" underneath. The card is a size container and the
    // price is a share of it, capped where it used to be.
    expect(rule(".nvx-pricing-plan")).toMatch(/container-type:\s*inline-size/);
    expect(rule(".nvx-pricing-amount")).toMatch(/font-size:\s*clamp\(1\.5rem,\s*15cqi,\s*2\.5rem\)/);
  });
});

describe("a pricing block's links when a page is renamed", () => {
  const map = movePath("/sites/acme/contact", "/sites/acme/talk-to-us");
  const block = (plans: PricingPlan[]): BaseBlock => ({ id: "p", type: "pricing", props: { plans, color: "" } });

  it("moves a plan's button that pointed at the page", () => {
    const tree = [block([plan(), plan({ buttonHref: "/sites/acme/contact#sales" }) as PricingPlan])];
    const { blocks, changed } = retargetLinks(tree as BaseBlock[], map);
    expect(changed).toBe(1);
    const plans = blocks[0].props.plans as PricingPlan[];
    expect(plans[1].buttonHref).toBe("/sites/acme/talk-to-us#sales");
    // The plan that went elsewhere is the same object, untouched.
    expect(plans[0]).toBe(tree[0].props.plans[0]);
  });

  it("reaches a pricing block inside a section", () => {
    const tree: BaseBlock[] = [
      { id: "s", type: "section", props: {}, children: [block([plan({ buttonHref: "/sites/acme/contact" }) as PricingPlan])] },
    ];
    const { blocks, changed } = retargetLinks(tree, map);
    expect(changed).toBe(1);
    expect(blocks[0].children![0].props.plans[0].buttonHref).toBe("/sites/acme/talk-to-us");
  });

  it("leaves an outside address alone", () => {
    const tree = [block([plan({ buttonHref: "https://example.com/sites/acme/contact" }) as PricingPlan])];
    const { blocks, changed } = retargetLinks(tree, map);
    expect(changed).toBe(0);
    expect(blocks).toBe(tree);
  });
});

describe("what the privacy audit makes of a pricing block", () => {
  const page = (props: unknown) => ({ title: "Prices", content: JSON.stringify([{ id: "p", type: "pricing", props }]) });

  it("reports a button to another site as an outbound link, which needs no consent", () => {
    const audit = auditSite({ pages: [page({ plans: [plan({ buttonHref: "https://buy.stripe.com/abc" }), plan()] })] });
    const links = audit.findings.filter((f) => f.kind === "outbound-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ host: "buy.stripe.com", where: "Prices", needsConsent: false });
    expect(audit.linkHosts).toEqual(["buy.stripe.com"]);
    // A link transmits nothing until somebody follows it.
    expect(audit.remoteHosts).toEqual([]);
  });

  it("says nothing about a button that stays on the site", () => {
    const audit = auditSite({ pages: [page({ plans: [plan({ buttonHref: "/sites/acme/contact" }), plan({ buttonHref: "#faq" })] })] });
    expect(audit.findings).toEqual([]);
    expect(audit.selfContained).toBe(true);
  });

  it("reads a link written into a feature", () => {
    const audit = auditSite({
      pages: [page({ plans: [plan({ features: ['Backed by <a href="https://status.example.com">our uptime</a>'] })] })],
    });
    expect(audit.linkHosts).toEqual(["status.example.com"]);
  });
});

describe("the words on a plan, as the panel edits them", () => {
  it("reads the words out of inline HTML", () => {
    expect(plainText("<b>Ten</b> projects")).toBe("Ten projects");
    expect(plainText("R&amp;D &lt;b&gt; &quot;x&quot; &#39;y&#39; &#x2713;")).toBe(`R&D <b> "x" 'y' ✓`);
    expect(plainText("one<br>two\nthree")).toBe("one two three");
    expect(plainText("a&nbsp;b")).toBe("a b");
    expect(plainText(undefined)).toBe("");
  });

  it("turns typed words into HTML that shows exactly those words", () => {
    for (const words of ["R&D", "<b>not bold</b>", "5 > 3 & 2 < 4", `"quoted" 'too'`]) {
      const html = textToHtml(words);
      expect(plainText(html)).toBe(words);
      // And what the validator stores reads back the same.
      expect(plainText(sanitizeInlineHtml(html))).toBe(words);
    }
    // The case the panel exists for: the stored form is not what was typed.
    expect(sanitizeInlineHtml("R&D")).toBe("R&amp;D");
  });

  it("keeps a field's formatting while its words are unchanged", () => {
    expect(editedText("<b>Pro</b>", "Pro")).toBe("<b>Pro</b>");
    expect(editedText("<b>Pro</b>", "Pro plus")).toBe("Pro plus");
    expect(editedText("R&amp;D", "R&D")).toBe("R&amp;D");
    expect(editedText("", "Q&A")).toBe("Q&amp;A");
    expect(hasFormatting("<b>Pro</b>")).toBe(true);
    expect(hasFormatting("R&amp;D")).toBe(false);
  });

  it("gives back the same box it was drawn from, so the caret does not move", () => {
    const previous = ["<b>Ten</b> projects", "Q&amp;A sessions", ""];
    for (const typed of ["Ten projects\nQ&A sessions\n", "Ten projects\nQ&A sessions\nA", "Ten projects\n\nQ&A sessions", ""]) {
      const features = featuresFromText(typed, previous);
      expect(featuresToText(features)).toBe(typed);
    }
  });

  it("keeps each feature's formatting through an edit to another line, and through a move", () => {
    const previous = ["<b>Ten</b> projects", "Priority support", "<em>Custom</em> domain"];
    expect(featuresFromText("Ten projects\nPriority support, weekdays\nCustom domain", previous)).toEqual([
      "<b>Ten</b> projects",
      "Priority support, weekdays",
      "<em>Custom</em> domain",
    ]);
    expect(featuresFromText("Custom domain\nTen projects", previous)).toEqual(["<em>Custom</em> domain", "<b>Ten</b> projects"]);
  });

  it("reads an empty box as no features, and stops at the limit", () => {
    expect(featuresFromText("", ["One"])).toEqual([]);
    const lines = Array.from({ length: 40 }, (_, i) => `F${i}`).join("\n");
    expect(featuresFromText(lines, [], MAX_PLAN_FEATURES)).toHaveLength(MAX_PLAN_FEATURES);
  });

  it("knows a field with nothing a visitor could read in it", () => {
    for (const blank of ["", " ", "<br>", "&nbsp;", "<b> </b>", null]) expect(isBlank(blank)).toBe(true);
    expect(isBlank("<b>x</b>")).toBe(false);
  });

  it("names a plan by its words, or by its place when it has none", () => {
    expect(planLabel({ name: "<b>Pro</b>" }, 1)).toBe("Pro");
    expect(planLabel({ name: "<br>" }, 1)).toBe("Plan 2");
  });

  it("starts a new plan from the price and period of the one before it", () => {
    const next = newPlan([plan({ price: "29 CHF", period: "im Monat" }) as PricingPlan]);
    expect(next).toMatchObject({ price: "29 CHF", period: "im Monat", highlighted: false, buttonHref: "#" });
    // And it is a plan the validator keeps as it is.
    expect(stored({ plans: [next] }).plans[0]).toEqual(next);
    expect(newPlan([]).price).toBe("€0");
  });
});
