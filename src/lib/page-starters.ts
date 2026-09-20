/**
 * What a new page starts as.
 *
 * "+ New page" used to hand over `[]`. On a site built from a template that
 * is a jarring thing to receive: every section of every other page sits in a
 * contained column with its own background and 80-odd pixels of air above and
 * below, and the first block dropped onto the new page lands flush in the
 * corner at the full width of the window. The page you just made is visibly
 * not part of the site you made it in, and putting that right by hand means
 * adding a section and matching five numbers to a page you have to keep
 * flipping back to.
 *
 * So a starter is built here instead, and it is built out of the site's own
 * pages rather than out of a house style: the background its sections
 * actually use, the padding they actually carry, the width they run to, and
 * the colours its headings and body copy are actually written in. A page made
 * in a dark site comes out dark; one made in a wide site comes out wide.
 */

import { BaseBlock, SectionProps } from "@/types";
import { uid } from "./utils";
import { isDarkColor, parseHex, readableTextOn } from "./site-theme";

/** The look a site's existing pages already have, as far as it can be read off them. */
export interface SiteLook {
  /** The background the site's ordinary sections use. */
  background: string;
  /** A second background, for a band that needs to separate itself from the first. */
  bandBackground: string;
  paddingY: number;
  paddingX: number;
  maxWidth: SectionProps["maxWidth"];
  align: SectionProps["align"];
  /** The colour the site's headings are written in. */
  headingColor: string;
  /** The colour its body copy is written in — quieter than the heading. */
  textColor: string;
  /** Quieter still: eyebrows, captions, small print. */
  mutedColor: string;
}

/** Where a site with nothing to read off it starts. */
export const DEFAULT_LOOK: SiteLook = {
  background: "#ffffff",
  bandBackground: "#f8fafc",
  paddingY: 80,
  paddingX: 24,
  maxWidth: "site",
  align: "center",
  headingColor: "#0f172a",
  textColor: "#475569",
  mutedColor: "#94a3b8",
};

/** The body and muted colours that read on a given background. */
function copyColorsFor(background: string): { text: string; muted: string } {
  return isDarkColor(background)
    ? { text: "#94a3b8", muted: "#64748b" }
    : { text: "#475569", muted: "#94a3b8" };
}

/**
 * A page's own bands: the sections sitting at the top of the tree.
 *
 * Nested sections are not bands. They are the cards and strips a band is
 * built out of, and they are shaped for that job — full width, 24px of
 * padding, no colour of their own. Counting them alongside the real bands is
 * what made a starter for the blog template come out 24px tall and
 * edge-to-edge: four decorative strips inside one band outvoted every band on
 * the page.
 */
function topLevelSections(blocks: BaseBlock[]): BaseBlock[] {
  return blocks.filter((b) => b.type === "section");
}

/** The value that turns up most often. Ties go to the one seen first. */
function commonest<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The colour the blocks of `type` inside these sections are written in, from
 * those that pass `accept`. Blocks carrying no colour of their own are not
 * counted — they are reading the site's own text colour, which is not a
 * choice this page made.
 */
function commonestChildColor(
  sections: BaseBlock[],
  type: BaseBlock["type"],
  accept: (props: Record<string, unknown>) => boolean = () => true,
): string | undefined {
  const colors: string[] = [];
  for (const section of sections) {
    for (const child of section.children ?? []) {
      if (child.type !== type) continue;
      const props = (child.props ?? {}) as Record<string, unknown>;
      if (!accept(props)) continue;
      const color = typeof props.color === "string" ? props.color.trim() : "";
      if (color) colors.push(color);
    }
  }
  return commonest(colors);
}

/**
 * Body copy, told apart from the small print above and below it.
 *
 * Sampling every text block together got this wrong on the site it matters
 * most for: a landing page carries one paragraph of body copy per section and
 * three or four eyebrows, captions and footnotes, so the quietest grey on the
 * page outvoted the colour the page is actually written in — and a new page
 * came out in #94a3b8 on white. Size is what separates them, and it is a
 * choice the author already made.
 */
const BODY_SIZES = new Set(["base", "lg", "xl"]);
const isBodyCopy = (props: Record<string, unknown>) => BODY_SIZES.has(String(props.size ?? "base"));
const isSmallPrint = (props: Record<string, unknown>) => String(props.size ?? "base") === "sm";

/**
 * Read a site's look off the pages it already has.
 *
 * Backgrounds are counted across the bands of every page, so the colour the
 * site actually spends its length in wins over a hero that appears once. The
 * hero is worth keeping too — it becomes the band background, which is what a
 * starter uses when a section has to hold itself apart from the one above it.
 */
export function readSiteLook(pageContents: string[]): SiteLook {
  const sections: BaseBlock[] = [];
  for (const content of pageContents) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content || "[]");
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) sections.push(...topLevelSections(parsed as BaseBlock[]));
  }
  if (sections.length === 0) return DEFAULT_LOOK;

  const props = sections.map((s) => s.props as Partial<SectionProps>);
  // Only a flat, readable colour is worth copying. A section backed by an
  // image would hand the new page a hero photograph it never asked for, and
  // one that is transparent — or that carries something this cannot read —
  // says nothing about what colour the page should be.
  const backgrounds = props
    .filter((p) => !p.backgroundImage)
    .map((p) => (typeof p.background === "string" ? p.background.trim() : ""))
    .filter((b) => !!parseHex(b));

  const background = commonest(backgrounds) ?? DEFAULT_LOOK.background;
  const others = backgrounds.filter((b) => b !== background);
  const bandBackground = commonest(others) ?? background;

  const paddings = props.map((p) => p.paddingY).filter((n): n is number => typeof n === "number");
  const sidePaddings = props.map((p) => p.paddingX).filter((n): n is number => typeof n === "number");
  const widths = props.map((p) => p.maxWidth).filter((w): w is SectionProps["maxWidth"] => !!w);
  const aligns = props.map((p) => p.align).filter((a): a is SectionProps["align"] => !!a);

  // Colours are read from the sections that share the background the starter
  // will use, so a site's body copy is not sampled off its one dark hero.
  const onBackground = sections.filter((s) => (s.props as Partial<SectionProps>)?.background === background);
  const copy = copyColorsFor(background);

  return {
    background,
    bandBackground,
    paddingY: commonest(paddings) ?? DEFAULT_LOOK.paddingY,
    paddingX: commonest(sidePaddings) ?? DEFAULT_LOOK.paddingX,
    maxWidth: commonest(widths) ?? DEFAULT_LOOK.maxWidth,
    align: commonest(aligns) ?? DEFAULT_LOOK.align,
    headingColor: commonestChildColor(onBackground, "heading") ?? readableTextOn(background),
    textColor: commonestChildColor(onBackground, "text", isBodyCopy) ?? copy.text,
    mutedColor: commonestChildColor(onBackground, "text", isSmallPrint) ?? copy.muted,
  };
}

// --- building blocks, in the site's own look ---

function block(type: BaseBlock["type"], props: Record<string, unknown>, children?: BaseBlock[]): BaseBlock {
  return children ? { id: uid(), type, props, children } : { id: uid(), type, props };
}

/** A section wearing the site's look. `band` picks the second background. */
function section(look: SiteLook, band: boolean, ...children: BaseBlock[]): BaseBlock {
  return block(
    "section",
    {
      background: band ? look.bandBackground : look.background,
      paddingY: look.paddingY,
      paddingX: look.paddingX,
      maxWidth: look.maxWidth,
      align: look.align,
    } satisfies SectionProps,
    children,
  );
}

/**
 * The colours a band uses. A band is a different background from the rest of
 * the page, so the colours sampled for the page can be the wrong ones on it —
 * a site whose body copy is near-black on white puts unreadable text on its
 * own dark band. Sampled colours are kept where the band matches the page and
 * worked out from the backdrop where it does not.
 */
function bandColors(look: SiteLook): { heading: string; text: string; muted: string } {
  if (look.bandBackground === look.background) {
    return { heading: look.headingColor, text: look.textColor, muted: look.mutedColor };
  }
  const copy = copyColorsFor(look.bandBackground);
  return { heading: readableTextOn(look.bandBackground), text: copy.text, muted: copy.muted };
}

function heading(look: SiteLook, text: string, level: 1 | 2 | 3 | 4, color = look.headingColor): BaseBlock {
  return block("heading", { text, level, align: look.align, color, weight: "bold" });
}

function paragraph(look: SiteLook, text: string, size: "sm" | "base" | "lg" | "xl" = "lg", color = look.textColor): BaseBlock {
  return block("text", { text, align: look.align, size, color });
}

/** A small line of type above a heading — the site's own eyebrow. */
function eyebrow(look: SiteLook, text: string, color = look.mutedColor): BaseBlock {
  return block("text", { text, align: look.align, size: "sm", color });
}

function spacer(height: number): BaseBlock {
  return block("spacer", { height });
}

/** A button with no colour of its own, so it reads the site accent. */
function button(look: SiteLook, label: string): BaseBlock {
  return block("button", { label, href: "", variant: "primary", size: "lg", align: look.align, color: "", textColor: "" });
}

/**
 * A row of columns, each cell holding its own blocks.
 *
 * Two parallel rows — one of headings, one of the paragraphs belonging under
 * them — look right at full width and come apart the moment the row halves:
 * they wrap independently, and a heading ends up above somebody else's
 * paragraph. One row whose cells hold both keeps each pair together wherever
 * it breaks. Each block records the column it belongs to, so the row does not
 * reshuffle the first time one is added to it or taken out.
 */
function columns(count: 2 | 3, gap: number, cells: BaseBlock[][]): BaseBlock {
  return block(
    "columns",
    { count, gap },
    cells.flatMap((cell, i) => cell.map((child) => ({ ...child, column: i }))),
  );
}

/** The head of one cell in a feature or pricing row. */
function cell(look: SiteLook, title: string, color = look.headingColor): BaseBlock {
  return block("heading", { text: title, level: 4, align: look.align, color, weight: "semibold" });
}

// --- the starters ---

export interface PageStarter {
  id: string;
  label: string;
  /** What the person choosing it is told they will get. */
  description: string;
  build: (look: SiteLook, title: string) => BaseBlock[];
}

export const PAGE_STARTERS: PageStarter[] = [
  {
    id: "basic",
    label: "Title and intro",
    description: "One section in the site's colours, with the page title and an opening paragraph.",
    build: (look, title) => [
      section(
        look,
        false,
        heading(look, title, 1),
        spacer(16),
        paragraph(
          look,
          "Say what this page is for in a sentence or two. Click any block to edit it, or drag a new one in from the left.",
          "xl",
        ),
      ),
    ],
  },
  {
    id: "about",
    label: "About",
    description: "An opening, a longer story on a band of its own, and three things you want known.",
    build: (look, title) => {
      const band = bandColors(look);
      return [
        section(
          look,
          false,
          eyebrow(look, "ABOUT US"),
          spacer(8),
          heading(look, title, 1),
          spacer(16),
          paragraph(look, "One or two sentences on who you are and what you do — the part a visitor should remember.", "xl"),
        ),
        section(
          look,
          true,
          heading(look, "Our story", 2, band.heading),
          spacer(16),
          paragraph(look, "How this started, and what you set out to change. Keep it concrete: the year, the problem, the first customer.", "lg", band.text),
          spacer(16),
          paragraph(look, "Where you are now, and where you are going next.", "lg", band.text),
        ),
        section(
          look,
          false,
          heading(look, "What we care about", 2),
          spacer(40),
          columns(3, 32, [
            [cell(look, "Craft"), paragraph(look, "What this means in the work you do every day.", "base")],
            [cell(look, "Honesty"), paragraph(look, "What a customer can hold you to.", "base")],
            [cell(look, "Speed"), paragraph(look, "What you will not trade away to get it.", "base")],
          ]),
        ),
      ];
    },
  },
  {
    id: "contact",
    label: "Contact",
    description: "An invitation, a working form, and the other ways to reach you.",
    build: (look, title) => {
      const band = bandColors(look);
      return [
        section(
          look,
          false,
          heading(look, title, 1),
          spacer(16),
          paragraph(look, "Tell us what you need and we will come back to you within one working day.", "xl"),
        ),
        section(
          look,
          true,
          block("form", {
            fields: [
              { label: "Name", type: "text", required: true },
              { label: "Email", type: "email", required: true },
              { label: "Message", type: "textarea", required: true },
            ],
            submitLabel: "Send message",
            successMessage: "Thank you — we have your message and will reply shortly.",
          }),
        ),
        section(
          look,
          false,
          columns(3, 32, [
            [cell(look, "Email"), paragraph(look, "hello@example.com", "base")],
            [cell(look, "Phone"), paragraph(look, "+1 (555) 010-0000", "base")],
            [cell(look, "Where we are"), paragraph(look, "1 Example Street, Your City", "base")],
          ]),
        ),
      ];
    },
  },
  {
    id: "services",
    label: "Services",
    description: "What you offer, in three, with a closing invitation.",
    build: (look, title) => {
      const band = bandColors(look);
      return [
        section(
          look,
          false,
          eyebrow(look, "WHAT WE DO"),
          spacer(8),
          heading(look, title, 1),
          spacer(16),
          paragraph(look, "A line on the shape of the work, so a visitor knows within seconds whether you are for them.", "xl"),
          spacer(48),
          columns(3, 32, [
            [cell(look, "The first thing"), paragraph(look, "Who it is for, what it costs you, and what they walk away with.", "base")],
            [cell(look, "The second thing"), paragraph(look, "Who it is for, what it costs you, and what they walk away with.", "base")],
            [cell(look, "The third thing"), paragraph(look, "Who it is for, what it costs you, and what they walk away with.", "base")],
          ]),
        ),
        section(
          look,
          true,
          heading(look, "Not sure which one you need?", 2, band.heading),
          spacer(12),
          paragraph(look, "Tell us about the problem and we will tell you honestly whether we can help.", "lg", band.text),
          spacer(24),
          button(look, "Get in touch"),
        ),
      ];
    },
  },
  {
    id: "pricing",
    label: "Pricing",
    description: "Three plans side by side, and the questions people ask before they buy.",
    build: (look, title) => {
      const band = bandColors(look);
      return [
        section(
          look,
          false,
          heading(look, title, 1),
          spacer(16),
          paragraph(look, "Simple pricing that grows with you. No setup fees, cancel whenever you like.", "xl"),
          spacer(48),
          columns(3, 32, [
            [cell(look, "Starter · $0"), block("list", { style: "check", items: ["One project", "Community support", "Core features"] })],
            [cell(look, "Team · $29"), block("list", { style: "check", items: ["Ten projects", "Email support", "Everything in Starter"] })],
            [cell(look, "Business · $99"), block("list", { style: "check", items: ["Unlimited projects", "Same-day support", "Everything in Team"] })],
          ]),
          spacer(24),
          button(look, "Start free"),
        ),
        section(
          look,
          true,
          heading(look, "Questions people ask", 2, band.heading),
          spacer(24),
          block("heading", { text: "Can I change plan later?", level: 4, align: look.align, color: band.heading, weight: "semibold" }),
          paragraph(look, "Yes, at any time — the change takes effect on your next bill.", "base", band.text),
          spacer(16),
          block("heading", { text: "Do you offer refunds?", level: 4, align: look.align, color: band.heading, weight: "semibold" }),
          paragraph(look, "Within 30 days, in full, no questions asked.", "base", band.text),
        ),
      ];
    },
  },
  {
    id: "blank",
    label: "Empty page",
    description: "Nothing at all. Start from a bare canvas.",
    build: () => [],
  },
];

/** The starter chosen by default when none is named. */
export const DEFAULT_STARTER = "basic";

export function findStarter(id: unknown): PageStarter | undefined {
  return typeof id === "string" ? PAGE_STARTERS.find((s) => s.id === id) : undefined;
}

/**
 * The content a new page begins with: the named starter, drawn in the look
 * read off the site's existing pages. An unknown starter falls back to the
 * default rather than to nothing, so a bad id never costs someone a page.
 */
export function startingContent(starterId: unknown, pageContents: string[], title: string): string {
  const starter = findStarter(starterId) ?? findStarter(DEFAULT_STARTER)!;
  return JSON.stringify(starter.build(readSiteLook(pageContents), title));
}
