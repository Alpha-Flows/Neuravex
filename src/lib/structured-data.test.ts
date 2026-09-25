import { describe, it, expect } from "vitest";
import type { BaseBlock } from "@/types";
import { businessData, faqPage, jsonLd, questionsOf } from "@/lib/structured-data";
import { emptyProfile } from "@/lib/legal/profile";
import { rewriteStructuredData, stripAppRuntime } from "@/lib/static-export";
import { normalizeBlockTree } from "@/lib/block-tree";

const accordion = (id: string, items: { title: string; body: string }[], faq?: boolean): BaseBlock => ({
  id,
  type: "accordion",
  props: { items, exclusive: false, openFirst: false, style: "bordered", ...(faq === undefined ? {} : { faq }) },
});

const legal = () => ({
  ...emptyProfile(),
  companyName: "Brot & Butter GmbH",
  address: { street: "Hauptstraße 1", extra: "", postalCode: "10115", city: "Berlin", country: "Deutschland" },
  phone: "+49 30 123456",
  email: "hallo@brot.example",
});

describe("the questions on a page", () => {
  it("are every accordion item that asks one and answers it, in page order, as plain text", () => {
    const blocks: BaseBlock[] = [
      accordion("a", [
        { title: "When are you <b>open</b>?", body: "Every day, <a href=\"/sites/x/hours\">see the hours</a>." },
        { title: "Opening hours", body: "Not a question." },
        { title: "Is it free?", body: "" },
      ]),
      { id: "s", type: "section", props: {}, children: [accordion("b", [{ title: "Do you deliver?", body: "Yes &amp; quickly." }])] },
      accordion("c", [{ title: "Hidden?", body: "Kept out." }], false),
    ];
    expect(questionsOf(blocks)).toEqual([
      { question: "When are you open?", answer: "Every day, see the hours." },
      { question: "Do you deliver?", answer: "Yes & quickly." },
    ]);
    expect(faqPage(questionsOf(blocks))).toMatchObject({ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "When are you open?" }, {}] });
    expect(faqPage([])).toBeNull();
  });

  it("can be kept out of the data by the block, which keeps the choice through the validator", () => {
    const result = normalizeBlockTree([accordion("a", [{ title: "Q?", body: "A" }], false)]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].props.faq).toBe(false);
  });
});

describe("the business", () => {
  const base = { siteName: "Bakery site", url: "https://bakery.example/", legal: legal() };

  it("is said only once its kind has been chosen", () => {
    expect(businessData({ ...base, type: null })).toBeNull();
    expect(businessData({ ...base, type: "Spaceport" })).toBeNull();
  });

  it("is the legal details' name, address, phone and email, with the footer's profiles", () => {
    const data = businessData({
      ...base,
      type: "Bakery",
      description: "Bread, <i>daily</i>.",
      social: [
        { network: "instagram", href: "https://instagram.com/brot" },
        { network: "email", href: "mailto:hallo@brot.example" },
      ],
    });
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "Bakery",
      name: "Brot & Butter GmbH",
      url: "https://bakery.example/",
      description: "Bread, daily.",
      address: { "@type": "PostalAddress", streetAddress: "Hauptstraße 1", postalCode: "10115", addressLocality: "Berlin", addressCountry: "Deutschland" },
      telephone: "+49 30 123456",
      email: "hallo@brot.example",
      sameAs: ["https://instagram.com/brot"],
    });
  });

  it("never gives a person's address, and falls back to the site's name", () => {
    const person = businessData({ ...base, type: "Person", legal: { ...legal(), companyName: "" } });
    expect(person).not.toHaveProperty("address");
    expect(person?.name).toBe("Bakery site");
  });

  it("cannot end its script early", () => {
    const body = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(body).not.toContain("<");
    expect(JSON.parse(body).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("structured data in the download", () => {
  const origin = "http://127.0.0.1:3939";
  const page =
    '<html><head></head><body><script>self.__next_f=1</script>' +
    `<script type="application/ld+json">${jsonLd({
      "@type": "Bakery",
      url: `${origin}/sites/acme`,
      logo: `${origin}/uploads/logo.png`,
      menu: `${origin}/sites/acme/menu`,
      sameAs: ["https://instagram.com/brot"],
    })}</script></body></html>`;

  it("is kept when every script is taken out", () => {
    const html = stripAppRuntime(page);
    expect(html).not.toContain("__next_f");
    expect(html).toContain('<script type="application/ld+json">');
  });

  it("has its addresses moved into the folder, full under the site's address when it is known", () => {
    const pages = new Map([["menu", "menu.html"]]);
    const relative = rewriteStructuredData(page, { siteSlug: "acme", pages, selfOrigins: [origin] });
    const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(relative.html)![1]);
    expect(data).toMatchObject({ url: "index.html", logo: "uploads/logo.png", menu: "menu.html", sameAs: ["https://instagram.com/brot"] });
    expect(relative.assets).toEqual(["uploads/logo.png"]);

    const full = rewriteStructuredData(page, { siteSlug: "acme", pages, selfOrigins: [origin], siteUrl: "https://bakery.example" });
    const fullData = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(full.html)![1]);
    expect(fullData).toMatchObject({ url: "https://bakery.example/", logo: "https://bakery.example/uploads/logo.png" });
  });

  it("is dropped when it does not parse", () => {
    const broken = '<script type="application/ld+json">{nope</script>';
    expect(rewriteStructuredData(broken, { siteSlug: "acme", pages: new Map() }).html).toBe("");
  });
});
