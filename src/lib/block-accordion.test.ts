import { describe, it, expect } from "vitest";
import { normalizeBlockTree } from "@/lib/block-tree";
import { auditSite } from "@/lib/legal/audit";
import { getBlockDefinition } from "@/lib/blocks";
import {
  MAX_ACCORDION_ITEMS,
  newAccordionItem,
  openAtStart,
  pastedLines,
  remapOpen,
  sameItems,
  withOpened,
  withToggled,
} from "@/lib/accordion-editing";
import { questionName, questionsOnPage } from "@/lib/accordion-page";
import { isBlank, textToHtml } from "@/lib/inline-text";
import type { AccordionProps } from "@/types";

/** One accordion through the validator every write path and both read paths use. */
function accordion(props: unknown): AccordionProps {
  const result = normalizeBlockTree([{ id: "faq", type: "accordion", props }]);
  if (!result.ok) throw new Error(result.error);
  expect(result.tree).toHaveLength(1);
  return result.tree[0].props as AccordionProps;
}

const question = (i: number) => ({ title: `Question ${i}`, body: `Answer ${i}` });

describe("an accordion's props on the way in", () => {
  it("keeps the palette's example exactly as it is", () => {
    // The MCP server hands this to an agent as the example of a good
    // accordion, so the validator must have nothing to say about it.
    const example = getBlockDefinition("accordion")!.defaultProps;
    expect(accordion(example)).toEqual(example);
  });

  it("cuts a list past the cap to the first hundred rather than emptying it", () => {
    const props = accordion({ items: Array.from({ length: 150 }, (_, i) => question(i)), style: "bordered" });
    expect(props.items).toHaveLength(100);
    expect(props.items[0]).toEqual(question(0));
    expect(props.items[99]).toEqual(question(99));
  });

  it("stops the panel offering to add a question at the same number", () => {
    // Two numbers in two files. If they drift apart, the panel either stops
    // early or lets somebody write a question that the next save throws away.
    const full = accordion({ items: Array.from({ length: MAX_ACCORDION_ITEMS + 1 }, (_, i) => question(i)) });
    expect(full.items).toHaveLength(MAX_ACCORDION_ITEMS);
    const one = accordion({ items: Array.from({ length: MAX_ACCORDION_ITEMS }, (_, i) => question(i)) });
    expect(one.items).toHaveLength(MAX_ACCORDION_ITEMS);
  });

  it("drops an entry that is not a question and keeps the rest", () => {
    const props = accordion({
      items: [null, "How long?", 42, ["a", "b"], question(1), undefined, question(2)],
    });
    expect(props.items).toEqual([question(1), question(2)]);
  });

  it("repairs a question whose fields are the wrong type instead of dropping it", () => {
    const props = accordion({ items: [{ title: 7, body: { html: "x" } }, { title: "Only a title" }] });
    expect(props.items).toEqual([
      { title: "", body: "" },
      { title: "Only a title", body: "" },
    ]);
  });

  it("strips scripts and script links from the question and the answer", () => {
    const props = accordion({
      items: [
        {
          title: 'Is it <script>alert(1)</script>safe? <a href="javascript:alert(2)">Tell me</a>',
          body:
            '<strong>Yes.</strong><script>fetch("/api/sites")</script> ' +
            '<a href="JaVaScRiPt:alert(3)">Not this</a> <a href="https://example.org/help">but this</a>' +
            '<span onmouseover="alert(4)">hover</span>',
        },
      ],
    });
    const [{ title, body }] = props.items;
    for (const html of [title, body]) {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/javascript:/i);
      expect(html).not.toMatch(/onmouseover/i);
    }
    expect(title).toBe("Is it safe? <a>Tell me</a>");
    expect(body).toContain("<strong>Yes.</strong>");
    expect(body).toContain('<a href="https://example.org/help">but this</a>');
  });

  it("keeps the line breaks an answer was written with", () => {
    // The answer is shown with its line breaks, so both kinds the canvas can
    // produce have to survive the sanitiser.
    const props = accordion({ items: [{ title: "Hours", body: "Monday to Friday\nSaturday<br>Sunday closed" }] });
    expect(props.items[0].body).toBe("Monday to Friday\nSaturday<br />Sunday closed");
  });

  it("would lose the line a plain Enter makes, which is why the canvas inserts a break instead", () => {
    // Chromium puts the new line of a contentEditable in a <div>. The inline
    // profile keeps the words and drops the element, so the line went too.
    const props = accordion({ items: [{ title: "Hours", body: "one<div>two</div>" }] });
    expect(props.items[0].body).toBe("onetwo");
  });

  it("cuts an absurdly long question or answer to a length a row can hold", () => {
    const props = accordion({ items: [{ title: "q".repeat(5000), body: "a".repeat(50_000) }] });
    expect(props.items[0].title).toHaveLength(1000);
    expect(props.items[0].body).toHaveLength(20_000);
  });

  it("falls back on a style it does not know, and on switches that are not switches", () => {
    const props = accordion({ items: "not a list", style: "fancy", exclusive: "yes", openFirst: 1 });
    expect(props).toEqual({ items: [], exclusive: false, openFirst: false, style: "bordered" });
    for (const style of ["bordered", "separated", "minimal"] as const) {
      expect(accordion({ items: [], style }).style).toBe(style);
    }
  });
});

describe("what the privacy audit sees in an accordion", () => {
  const site = (items: unknown[]) =>
    auditSite({ pages: [{ title: "FAQ", content: JSON.stringify([{ id: "faq", type: "accordion", props: { items } }]) }] });

  it("lists a link inside an answer as an outbound link, not as a host the page loads", () => {
    const audit = site([{ title: "Where?", body: 'See <a href="https://example.org">the map</a>.' }]);
    expect(audit.findings).toContainEqual(
      expect.objectContaining({ kind: "outbound-link", host: "example.org", where: "FAQ", needsConsent: false }),
    );
    expect(audit.linkHosts).toEqual(["example.org"]);
    expect(audit.remoteHosts).toEqual([]);
    expect(audit.selfContained).toBe(true);
  });

  it("finds a link in a question as well as in an answer", () => {
    const audit = site([{ title: 'Read <a href="https://docs.example.net/faq">this</a>', body: "Please." }]);
    expect(audit.linkHosts).toEqual(["docs.example.net"]);
  });

  it("reports no remote picture, because the answer's sanitiser never lets one through", () => {
    // An answer is inline text: bold, italic, links. A tracker <img> pasted
    // into one is stripped on the way in, and the audit reads the sanitised
    // form too — which is what a visitor's browser is handed — so a row
    // written before the validator existed does not load it either.
    const pixel = '<img src="https://tracker.example/x.gif" alt="">';
    expect(accordion({ items: [{ title: "Q", body: `Hello ${pixel}` }] }).items[0].body).toBe("Hello ");

    const audit = site([{ title: `Q ${pixel}`, body: `Hello ${pixel}` }]);
    expect(audit.findings.filter((f) => f.kind === "remote-asset")).toEqual([]);
    expect(audit.remoteHosts).not.toContain("tracker.example");
    expect(audit.selfContained).toBe(true);
  });
});

describe("which answers the canvas shows open", () => {
  it("starts as the page starts", () => {
    expect(openAtStart(true, 3)).toEqual([0]);
    expect(openAtStart(false, 3)).toEqual([]);
    expect(openAtStart(true, 0)).toEqual([]);
  });

  it("closes the others when one is opened in an exclusive accordion", () => {
    expect(withToggled([0], 2, true)).toEqual([2]);
    expect(withToggled([2], 2, true)).toEqual([]);
  });

  it("leaves the others alone when it is not exclusive", () => {
    expect(withToggled([0], 2, false)).toEqual([0, 2]);
    expect(withToggled([0, 2], 0, false)).toEqual([2]);
  });

  it("opens a question that was just added, once", () => {
    expect(withOpened([0], 3, false)).toEqual([0, 3]);
    expect(withOpened([0, 3], 3, false)).toEqual([0, 3]);
    expect(withOpened([0], 3, true)).toEqual([3]);
  });

  it("adds a question with words in it, which the validator keeps as they are", () => {
    const item = newAccordionItem();
    expect(item.title.trim()).not.toBe("");
    expect(item.body.trim()).not.toBe("");
    expect(accordion({ items: [item] }).items).toEqual([item]);
  });
});

describe("the open answers when the list changes under them", () => {
  const a = question(1);
  const b = question(2);
  const c = question(3);
  const twin = newAccordionItem();

  it("follows an open question that was moved down in the panel", () => {
    // Remembered by position, the old place stayed open — a different question.
    expect(remapOpen([0], [a, b, c], [b, a, c])).toEqual([1]);
  });

  it("follows an open question when one above it is removed", () => {
    expect(remapOpen([2], [a, b, c], [a, c])).toEqual([1]);
  });

  it("lets go of an open question that was removed, rather than opening its neighbour", () => {
    expect(remapOpen([1], [a, b, c], [a, c])).toEqual([]);
  });

  it("keeps a question open while its words are being edited", () => {
    const edited = { ...b, title: "Question 2, reworded" };
    expect(remapOpen([1], [a, b, c], [a, edited, c])).toEqual([1]);
  });

  it("keeps the one being typed into open when another reads the same", () => {
    // Two freshly added questions are identical. A search by content alone
    // found the first twin and opened it instead of the one being edited.
    const edited = { ...twin, title: "Changed" };
    expect(remapOpen([2], [a, twin, twin], [a, twin, edited])).toEqual([2]);
  });

  it("keeps each twin apart when a list holding both is reordered", () => {
    expect(remapOpen([1, 2], [a, twin, twin], [twin, twin, a])).toEqual([0, 1]);
  });

  it("keeps a position when the length is unchanged and nothing matches", () => {
    // An undo can change more than one question at once.
    const x = question(8);
    const y = question(9);
    expect(remapOpen([0], [a, b, c], [x, y, c])).toEqual([0]);
  });

  it("drops a position that nothing matches once the length has changed", () => {
    const x = question(8);
    expect(remapOpen([0], [a, b, c], [x, b])).toEqual([]);
  });

  it("leaves a question added at the end closed unless it is opened on purpose", () => {
    expect(remapOpen([0], [a, b], [a, b, twin])).toEqual([0]);
  });

  it("compares lists by their words, since the validator rebuilds every item", () => {
    expect(sameItems([a, b], [{ ...a }, { ...b }])).toBe(true);
    expect(sameItems([a, b], [b, a])).toBe(false);
    expect(sameItems([a], [a, b])).toBe(false);
  });
});

describe("what a paste puts into a question or an answer", () => {
  it("gives an answer its lines, to be joined by line breaks", () => {
    expect(pastedLines("Para one.\n\nPara two.\nItem a\nItem b", true)).toEqual([
      "Para one.",
      "",
      "Para two.",
      "Item a",
      "Item b",
    ]);
  });

  it("reads Windows and old Mac line endings as line breaks too", () => {
    expect(pastedLines("one\r\ntwo\rthree", true)).toEqual(["one", "two", "three"]);
  });

  it("drops the newline a copied paragraph ends with", () => {
    expect(pastedLines("Just this.\n", true)).toEqual(["Just this."]);
    expect(pastedLines("Just this.\r\n\r\n", false)).toEqual(["Just this."]);
  });

  it("puts a question on one line, a space where each break was", () => {
    expect(pastedLines("How long does\n  delivery take?", false)).toEqual(["How long does delivery take?"]);
    expect(pastedLines("Two\r\n\r\nlines", false)).toEqual(["Two lines"]);
  });

  it("leaves the spaces around a pasted word alone", () => {
    // Pasted into the middle of a title, a leading space is the author's.
    expect(pastedLines(" long", false)).toEqual([" long"]);
  });

  it("stores what the canvas ends up with, line breaks and all", () => {
    // The canvas inserts each line as text, so markup in the copied text is
    // shown as the characters it is, with a break between the lines.
    const body = pastedLines("Para one.\nPara <b>two</b>.", true).map(textToHtml).join("<br>");
    expect(accordion({ items: [{ title: "Q", body }] }).items[0].body).toBe("Para one.<br />Para &lt;b&gt;two&lt;/b&gt;.");
  });
});

describe("a question with no words", () => {
  it("is what a cleared field is stored as", () => {
    // Chromium leaves a lone <br> in an emptied contentEditable.
    const [item] = accordion({ items: [{ title: "<br>", body: "&nbsp; <br/>" }] }).items;
    expect(item.title).toBe("<br />");
    expect(isBlank(item.title)).toBe(true);
    expect(isBlank(item.body)).toBe(true);
    expect(isBlank("Mon–Fri<br />Sat")).toBe(false);
  });

  it("is left off the page when its answer is empty too", () => {
    const rows = questionsOnPage([question(1), { title: "<br />", body: "" }, question(3)]);
    expect(rows.map((r) => r.index)).toEqual([0, 2]);
  });

  it("is named on the page by its place, when it has an answer", () => {
    const rows = questionsOnPage([question(1), { title: "<br />", body: "Still worth reading." }]);
    expect(rows.map((r) => r.index)).toEqual([0, 1]);
    // The same words the canvas shows as the placeholder, so a <summary> is
    // never nameless.
    expect(questionName(rows[1].index)).toBe("Question 2");
  });

  it("keeps a question whose answer is empty", () => {
    expect(questionsOnPage([{ title: "Any questions?", body: "<br />" }])).toHaveLength(1);
  });
});
