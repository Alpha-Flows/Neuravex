import { describe, it, expect } from "vitest";
import * as lucide from "lucide-react";
import { normalizeBlockTree } from "@/lib/block-tree";
import { getBlockDefinition } from "@/lib/blocks";
import {
  DEFAULT_ICON,
  ICON_NAMES,
  ICON_RENAMES,
  iconLabel,
  isIconName,
  resolveIconName,
  searchIcons,
} from "@/lib/icon-names";
import { ICON_SET } from "@/lib/icon-set";
import { iconOutlineName, textForBox, textFromBox, textHasFormatting, wordsOrNothing } from "@/lib/icon-card";
import { editedText, isBlank, plainText } from "@/lib/inline-text";
import type { IconProps } from "@/types";

/** One icon block through the validator every write path and both read paths use. */
function icon(props: unknown): IconProps {
  const result = normalizeBlockTree([{ id: "i", type: "icon", props }]);
  if (!result.ok) throw new Error(result.error);
  expect(result.tree).toHaveLength(1);
  return result.tree[0].props as IconProps;
}

/** lucide's export name for one of its file names: `map-pin` → `MapPin`, `flower-2` → `Flower2`. */
const exportName = (name: string) =>
  name.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("");

const exported = lucide as unknown as Record<string, unknown>;

describe("an icon block's props on the way in", () => {
  it("keeps the palette's example exactly as it is", () => {
    // The MCP server hands this to an agent as the example of a good icon
    // block, so the validator must have nothing to say about it.
    const example = getBlockDefinition("icon")!.defaultProps;
    expect(icon(example)).toEqual(example);
    expect(isIconName(example.icon)).toBe(true);
  });

  it("falls back to the star for a name it does not know, or none at all", () => {
    for (const value of ["unicorn", "", "STAR", " zap", 42, null, ["zap"], { name: "zap" }, undefined]) {
      expect(icon({ icon: value }).icon).toBe(DEFAULT_ICON);
    }
    expect(icon({}).icon).toBe("star");
  });

  it("does not take a name every object answers to for one of the icons", () => {
    // The table and the renames are plain objects, so a lookup by `in` or by
    // indexing would find these on the prototype and hand back a function
    // where a drawing or a label was expected.
    for (const value of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
      expect(isIconName(value), value).toBe(false);
      expect(resolveIconName(value), value).toBe(DEFAULT_ICON);
      expect(icon({ icon: value }).icon, value).toBe(DEFAULT_ICON);
      expect(ICON_SET[resolveIconName(value)], value).toBe(ICON_SET.star);
    }
    expect(iconLabel("constructor")).toBe("Star");
    expect(iconLabel("__proto__")).toBe("Star");
  });

  it("keeps every name in the set as it is", () => {
    for (const name of ICON_NAMES) expect(icon({ icon: name }).icon).toBe(name);
  });

  it("repairs a name lucide used to spell differently to the one it has now", () => {
    // What an agent writing from memory of an older lucide is likely to send.
    expect(icon({ icon: "home" }).icon).toBe("house");
    expect(icon({ icon: "smile" }).icon).toBe("face-slightly-smiling");
    expect(icon({ icon: "alert-triangle" }).icon).toBe("triangle-alert");
    expect(icon({ icon: "help-circle" }).icon).toBe("circle-question-mark");
  });

  it("repairs a size, shape or alignment it does not recognise instead of dropping the block", () => {
    const props = icon({ icon: "phone", size: "huge", shape: "hexagon", align: "middle" });
    expect(props).toMatchObject({ icon: "phone", size: "md", shape: "circle", align: "left" });
    expect(icon({ size: 3, shape: null, align: 7 })).toMatchObject({ size: "md", shape: "circle", align: "left" });
  });

  it("keeps each size, shape and alignment it does recognise", () => {
    for (const size of ["sm", "md", "lg", "xl"] as const) expect(icon({ size }).size).toBe(size);
    for (const shape of ["none", "circle", "square"] as const) expect(icon({ shape }).shape).toBe(shape);
    for (const align of ["left", "center", "right"] as const) expect(icon({ align }).align).toBe(align);
  });

  it("keeps a colour and refuses one with a second declaration hidden in it", () => {
    expect(icon({ color: "#0ea5e9" }).color).toBe("#0ea5e9");
    expect(icon({ color: "" }).color).toBe("");
    expect(icon({ color: "red;background:url(https://attacker.example/x)" }).color).toBe("");
  });

  it("sanitises the title and text, which are drawn as markup", () => {
    const props = icon({
      title: 'Fast<img src=x onerror="alert(1)">',
      text: "<strong>Really</strong> fast<script>alert(1)</script>",
    });
    expect(props.title).toContain("Fast");
    expect(props.title).not.toMatch(/<img|onerror/i);
    expect(props.text).toContain("<strong>Really</strong>");
    expect(props.text).not.toMatch(/<script|alert/i);
  });

  it("cuts a title and a text to a length a row can hold", () => {
    const props = icon({ title: "t".repeat(1000), text: "x".repeat(5000) });
    expect(props.title.length).toBeLessThanOrEqual(300);
    expect(props.text.length).toBeLessThanOrEqual(2000);
  });

  it("turns a title or text that is not a string into nothing", () => {
    expect(icon({ title: 42, text: { html: "x" } })).toMatchObject({ title: "", text: "" });
  });
});

describe("the bundled icon set", () => {
  it("has no name twice, and every name in lucide's own kebab case", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    for (const name of ICON_NAMES) expect(name).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
  });

  it("is about a hundred, and holds the fallback and the palette's default", () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(80);
    expect(ICON_NAMES.length).toBeLessThanOrEqual(150);
    expect(ICON_NAMES).toContain("star");
    expect(ICON_NAMES).toContain("zap");
  });

  it("has a drawing for every name, and no drawing without a name", () => {
    for (const name of ICON_NAMES) expect(ICON_SET[name], name).toBeTruthy();
    expect(Object.keys(ICON_SET).sort()).toEqual([...ICON_NAMES].sort());
  });

  it("draws each name with the lucide export that name spells", () => {
    // So `phone` cannot quietly be drawn as an envelope, and a name lucide
    // renames in an upgrade fails here rather than on somebody's page.
    for (const name of ICON_NAMES) {
      expect(exported[exportName(name)], name).toBeDefined();
      expect(ICON_SET[name], name).toBe(exported[exportName(name)]);
    }
  });

  it("repairs an old spelling only to the drawing lucide itself says it is", () => {
    for (const [old, now] of Object.entries(ICON_RENAMES)) {
      expect(isIconName(old), old).toBe(false);
      expect(isIconName(now), now).toBe(true);
      expect(exported[exportName(old)], old).toBe(exported[exportName(now)]);
      expect(resolveIconName(old)).toBe(now);
    }
  });

  it("draws the star for a name it does not know", () => {
    expect(ICON_SET[resolveIconName("unicorn")]).toBe(ICON_SET.star);
    expect(ICON_SET[resolveIconName(undefined)]).toBe(ICON_SET.star);
    expect(ICON_SET[resolveIconName("home")]).toBe(ICON_SET.house);
  });

  it("gives every icon a name of its own to be read out by", () => {
    // A lone icon is announced by this, and so is each button in the picker;
    // two called the same would be two buttons nobody could tell apart.
    const labels = ICON_NAMES.map((name) => iconLabel(name));
    for (const label of labels) expect(label.trim()).not.toBe("");
    expect(new Set(labels).size).toBe(labels.length);
    expect(iconLabel("unicorn")).toBe(iconLabel("star"));
  });
});

describe("searching the picker", () => {
  it("shows every icon for an empty search", () => {
    expect(searchIcons("")).toEqual(ICON_NAMES);
    expect(searchIcons("   ")).toEqual(ICON_NAMES);
  });

  it("finds an icon by its name, its label or a word somebody would use for it", () => {
    expect(searchIcons("map-pin")).toContain("map-pin");
    expect(searchIcons("map pin")).toContain("map-pin");
    expect(searchIcons("envelope")).toContain("mail");
    expect(searchIcons("email")).toContain("mail");
    expect(searchIcons("plumb")).toContain("droplets");
    expect(searchIcons("DENTIST")).toContain("face-slightly-smiling");
  });

  it("treats an accent as the letter under it", () => {
    expect(searchIcons("cafe")).toContain("coffee");
    expect(searchIcons("café")).toContain("coffee");
  });

  it("narrows with every word rather than widening", () => {
    expect(searchIcons("shopping bag")).toEqual(["shopping-bag"]);
  });

  it("finds nothing for a word none of them carry", () => {
    expect(searchIcons("xylophone")).toEqual([]);
  });
});

describe("when a card's title or text counts as empty", () => {
  it("counts what an emptied contentEditable leaves behind as nothing", () => {
    // Chrome keeps a <br> in a heading once its last character is deleted,
    // and the editor reported that as the title — which kept an empty <h3>
    // on the published card.
    for (const html of ["", "   ", "<br>", "<br />", "<b></b>", "&nbsp;", " &nbsp; <br/> ", "\u00a0", null, undefined, 42]) {
      expect(isBlank(html), String(html)).toBe(true);
    }
    expect(wordsOrNothing("<br />")).toBe("");
    expect(wordsOrNothing(" &nbsp; ")).toBe("");
  });

  it("keeps anything with a word in it exactly as written", () => {
    expect(isBlank("Fast")).toBe(false);
    expect(isBlank("<strong>Fast</strong>")).toBe(false);
    expect(isBlank("&amp;")).toBe(false);
    expect(wordsOrNothing("<em>Fast</em><br />")).toBe("<em>Fast</em><br />");
  });
});

describe("a card's words in the panel", () => {
  it("shows a title as words and keeps its stored form while the words are the same", () => {
    const stored = "Bed &amp; <b>breakfast</b>";
    expect(plainText(stored)).toBe("Bed & breakfast");
    expect(editedText(stored, "Bed & breakfast")).toBe(stored);
    expect(editedText(stored, "Bed & breakfast!")).toBe("Bed &amp; breakfast!");
    // What is typed is words, never markup.
    expect(editedText("", "<b>Hi</b>")).toBe("&lt;b&gt;Hi&lt;/b&gt;");
  });

  it("shows the text a line per line of the card", () => {
    expect(textForBox("Mon to Fri<br />Sat &amp; Sun")).toBe("Mon to Fri\nSat & Sun");
    expect(textForBox("Open daily<br>Closed <b>Christmas</b>")).toBe("Open daily\nClosed Christmas");
    // A newline written by an agent is a line on the card, so it is one here.
    expect(textForBox("One\nTwo\r\nThree")).toBe("One\nTwo\nThree");
    expect(textForBox(undefined)).toBe("");
  });

  it("stores retyped text as words, each line break as a <br>", () => {
    expect(textFromBox("", "Fish & chips\n<b>Fridays</b>")).toBe("Fish &amp; chips<br />&lt;b&gt;Fridays&lt;/b&gt;");
    // Every stored form reads back as exactly what was typed, so the box
    // never moves the text under the caret.
    for (const typed of ["a", "a\n", "a\n\nb", "R&D <team>", " spaced  out "]) {
      expect(textForBox(textFromBox("", typed))).toBe(typed);
    }
  });

  it("keeps the stored text, bold and all, while its lines read the same", () => {
    const stored = "<strong>Fast</strong><br />Really fast";
    expect(textFromBox(stored, "Fast\nReally fast")).toBe(stored);
    expect(textFromBox(stored, "Fast\nReally quick")).toBe("Fast<br />Really quick");
  });

  it("warns about formatting only when there is some, not for a line break", () => {
    expect(textHasFormatting("One<br />Two")).toBe(false);
    expect(textHasFormatting("One\nTwo")).toBe(false);
    expect(textHasFormatting("One<br /><b>Two</b>")).toBe(true);
    expect(textHasFormatting('See <a href="/x">us</a>')).toBe(true);
  });
});

describe("what the outline calls an icon block", () => {
  it("names a card by its title, then its text, and a lone icon by what it shows", () => {
    expect(iconOutlineName({ icon: "zap", title: "Fast &amp; <b>safe</b>", text: "Pages load" })).toBe("Fast & safe");
    expect(iconOutlineName({ icon: "zap", title: "<br />", text: "Pages<br />load" })).toBe("Pages load");
    expect(iconOutlineName({ icon: "map-pin", title: "", text: "" })).toBe("Map pin");
    expect(iconOutlineName({ icon: "unicorn" })).toBe("Star");
    expect(iconOutlineName(null)).toBe("Star");
  });

  it("cuts a long title the way the outline cuts everything else", () => {
    const name = iconOutlineName({ icon: "zap", title: "x".repeat(50) });
    expect(name).toBe(`${"x".repeat(34)}…`);
  });
});
