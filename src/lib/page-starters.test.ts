import { describe, it, expect } from "vitest";
import { DEFAULT_LOOK, PAGE_STARTERS, findStarter, readSiteLook, startingContent } from "./page-starters";
import { TEMPLATES } from "./templates";
import { BaseBlock, SectionProps } from "@/types";
import { parseHex } from "./site-theme";

const band = (background: string, extra: Partial<SectionProps> = {}, children: BaseBlock[] = []) =>
  JSON.stringify([
    { id: "s", type: "section", props: { background, paddingY: 80, paddingX: 24, maxWidth: "site", align: "center", ...extra }, children },
  ]);

describe("reading a site's look", () => {
  it("falls back to a default when there is nothing to read", () => {
    expect(readSiteLook([])).toEqual(DEFAULT_LOOK);
    expect(readSiteLook(["[]", "not json"])).toEqual(DEFAULT_LOOK);
  });

  it("takes the colour the site spends its length in, not the one-off hero", () => {
    const look = readSiteLook([band("#0b0f1e"), band("#ffffff"), band("#ffffff")]);
    expect(look.background).toBe("#ffffff");
    // The hero is still worth having — it becomes the band.
    expect(look.bandBackground).toBe("#0b0f1e");
  });

  it("uses one background for both when the site only has one", () => {
    const look = readSiteLook([band("#ffffff")]);
    expect(look.bandBackground).toBe("#ffffff");
  });

  it("keeps the site's padding, width and alignment", () => {
    const look = readSiteLook([band("#ffffff", { paddingY: 112, paddingX: 40, maxWidth: "4xl", align: "left" })]);
    expect(look).toMatchObject({ paddingY: 112, paddingX: 40, maxWidth: "4xl", align: "left" });
  });

  it("ignores a band it cannot read a colour off", () => {
    // A hero built on a photograph says nothing about what colour the page is,
    // and "transparent" says nothing either.
    const look = readSiteLook([
      band("#123456", { backgroundImage: "/hero.jpg" }),
      band("transparent"),
      band("#ffffff"),
    ]);
    expect(look.background).toBe("#ffffff");
  });

  it("counts only a page's own bands, not the strips inside them", () => {
    // Four decorative strips inside one band used to outvote every band on
    // the page, and a starter came out 24px tall and edge to edge.
    const nested = JSON.stringify([
      {
        id: "outer", type: "section",
        props: { background: "#ffffff", paddingY: 96, paddingX: 24, maxWidth: "site", align: "center" },
        children: [1, 2, 3, 4].map((n) => ({
          id: `in${n}`, type: "section",
          props: { background: "#eeeeee", paddingY: 24, paddingX: 24, maxWidth: "full", align: "left" },
        })),
      },
    ]);
    const look = readSiteLook([nested]);
    expect(look).toMatchObject({ background: "#ffffff", paddingY: 96, maxWidth: "site" });
  });

  it("tells body copy from the small print above and below it", () => {
    const page = band("#ffffff", {}, [
      { id: "e1", type: "text", props: { text: "EYEBROW", size: "sm", color: "#94a3b8" } },
      { id: "e2", type: "text", props: { text: "caption", size: "sm", color: "#94a3b8" } },
      { id: "e3", type: "text", props: { text: "footnote", size: "sm", color: "#94a3b8" } },
      { id: "b1", type: "text", props: { text: "Body copy", size: "lg", color: "#475569" } },
    ] as BaseBlock[]);
    const look = readSiteLook([page]);
    expect(look.textColor).toBe("#475569");
    expect(look.mutedColor).toBe("#94a3b8");
  });

  it("works out a readable heading colour when the site never set one", () => {
    expect(readSiteLook([band("#0b0f1e")]).headingColor).toBe("#ffffff");
    expect(readSiteLook([band("#ffffff")]).headingColor).toBe("#0f172a");
  });
});

describe("what a new page starts as", () => {
  it("is a starter, not an empty page", () => {
    const content = JSON.parse(startingContent(undefined, [band("#ffffff")], "About"));
    expect(content.length).toBeGreaterThan(0);
    expect(content[0].type).toBe("section");
  });

  it("puts the page's own title on it", () => {
    const content = JSON.parse(startingContent("basic", [band("#ffffff")], "Our story"));
    const heading = content[0].children.find((b: BaseBlock) => b.type === "heading");
    expect(heading.props.text).toBe("Our story");
  });

  it("dresses the page in the look it read", () => {
    const content = JSON.parse(
      startingContent("about", [band("#101010", { paddingY: 112, maxWidth: "4xl", align: "left" })], "About"),
    );
    for (const section of content) {
      expect(section.props).toMatchObject({ paddingY: 112, maxWidth: "4xl", align: "left" });
    }
    expect(content[0].props.background).toBe("#101010");
  });

  it("still gives an empty page to whoever asks for one", () => {
    expect(startingContent("blank", [band("#ffffff")], "Scratch")).toBe("[]");
  });

  it("falls back to the default rather than to nothing for an id it does not know", () => {
    expect(JSON.parse(startingContent("nonsense", [band("#ffffff")], "About")).length).toBeGreaterThan(0);
  });

  it("names every starter it offers", () => {
    for (const starter of PAGE_STARTERS) {
      expect(findStarter(starter.id)).toBe(starter);
      expect(starter.label.length).toBeGreaterThan(0);
      expect(starter.description.length).toBeGreaterThan(0);
    }
  });
});

describe("every starter, on every template", () => {
  // A starter that lands unreadable is worse than the blank page it replaced,
  // so each one is built against each template's real look and checked.
  const contrast = (fg: string, bg: string) => {
    const lum = (hex: string) => {
      const [r, g, b] = parseHex(hex)!.map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };

  /** Small print is the size the author already chose it at. */
  const contrastTarget = (block: BaseBlock) =>
    block.type === "text" && block.props?.size === "sm" ? "muted" : "body";

  for (const template of TEMPLATES) {
    it(`reads on ${template.id}`, () => {
      const look = readSiteLook(template.pages.map((p) => JSON.stringify(p.blocks)));
      for (const starter of PAGE_STARTERS) {
        for (const section of starter.build(look, "Test page") as BaseBlock[]) {
          const background = section.props.background as string;
          expect(parseHex(background), `${starter.id} background ${background}`).toBeTruthy();
          for (const child of section.children ?? []) {
            const color = child.props?.color;
            if (typeof color !== "string" || !color) continue;
            // Headings and body copy have to be properly readable. The small
            // print is held to a lower bar on purpose: that colour is the
            // site's own eyebrow colour, copied rather than chosen, and every
            // template writes its eyebrows at about 2.5:1. Departing from it
            // to satisfy a number here would make the new page the one that
            // does not match, which is the whole thing being fixed. The bar is
            // there to catch the failure that mattered — text on a backdrop it
            // cannot be seen against at all.
            const small = color === look.mutedColor || contrastTarget(child) === "muted";
            expect(
              contrast(color, background),
              `${template.id}/${starter.id}: ${color} on ${background}`,
            ).toBeGreaterThan(small ? 2 : 4.5);
          }
        }
      }
    });
  }
});
