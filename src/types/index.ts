// Shared types between server and client.

export type BlockType =
  | "heading"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "section"
  | "columns"
  | "video"
  | "quote"
  | "list"
  | "form"
  | "html";

export interface BaseBlock {
  id: string;
  type: BlockType;
  // Block-specific props. Typed permissively so the tree can be serialized
  // freely; block components cast to their specific shape at the boundary.
  props: any;
  children?: BaseBlock[];
  /**
   * Which column of the parent `columns` block this child sits in.
   * Only meaningful for direct children of a columns block; absent on
   * content authored before columns tracked placement explicitly.
   */
  column?: number;
  /**
   * Depth: which blocks this one sits over, and whether it is lifted out of
   * the flow to overlap them at all. Absent means an ordinary block in the
   * flow — see `BlockLayer`.
   */
  layer?: BlockLayer;
}

export interface SectionProps {
  background: string; // hex / rgba / "transparent" — used when no backgroundImage is set
  backgroundImage?: string; // optional image URL, takes priority over background
  backgroundOverlay?: string; // optional rgba() tint layered over backgroundImage for legibility
  paddingY: number; // px
  paddingX: number; // px
  /**
   * "site" follows the site's own content width, so widening the site in
   * Settings widens the section with it. The rest are fixed reading widths,
   * and "full" spans the window.
   */
  maxWidth: "site" | "full" | "7xl" | "6xl" | "5xl" | "4xl";
  /** Where the content sits inside the page's column, not inside the window. */
  align: "left" | "center" | "right";
}

/**
 * One column's own backdrop. Same pieces as a section — colour, or image with
 * an optional tint — so a single column can carry an image behind its text
 * without the whole row taking it.
 */
export interface ColumnStyle {
  background?: string; // hex / rgba / "transparent" — used when no backgroundImage is set
  backgroundImage?: string; // optional image URL, takes priority over background
  backgroundOverlay?: string; // optional rgba() tint layered over backgroundImage for legibility
  padding?: number; // px of space between the column's edge and its blocks
  radius?: number; // px corner rounding
}

export interface ColumnsProps {
  count: 2 | 3 | 4;
  gap: number; // px
  /**
   * Per-column backdrops, index-aligned with the columns: `columnStyles[1]`
   * is the second column. Absent, or an absent entry, means the column is
   * plain and shows whatever is behind the block.
   */
  columnStyles?: ColumnStyle[];
}

export interface HeadingProps {
  text: string;
  /** The tag, and with it the document outline a screen reader reads. */
  level: 1 | 2 | 3 | 4;
  align: "left" | "center" | "right";
  color: string;
  weight: "normal" | "medium" | "semibold" | "bold";
  /**
   * How big it is drawn, when that should not follow the level.
   *
   * Size and outline are the same choice everywhere else in this app, which
   * works for a landing page and not for a document: the section headings of
   * an Impressum are h2 because that is what they are, and setting them at
   * 48px makes a page of prose read like six stacked heroes. Absent, the
   * level decides, so nothing already written changes.
   */
  size?: 1 | 2 | 3 | 4;
}

export interface TextProps {
  text: string;
  align: "left" | "center" | "right" | "justify";
  size: "sm" | "base" | "lg" | "xl";
  color: string;
}

export interface ImageProps {
  src: string;
  alt: string;
  rounded: "none" | "md" | "xl" | "full";
  width: "small" | "medium" | "large" | "full";
  caption: string;
  /**
   * The picture's own pixel size, when it is known — from the file when it was
   * uploaded or picked from the library. It is what the browser needs to hold
   * the right amount of space before the image arrives, instead of letting the
   * page jump as each one loads. `width` above is a layout choice; these two
   * are a fact about the file.
   */
  naturalWidth?: number;
  naturalHeight?: number;
  /**
   * True while `alt` is the description the picture library holds for this
   * file rather than words written here. Choosing another picture replaces a
   * borrowed description — it described the old photograph — and leaves an
   * author's own words alone.
   */
  altFromLibrary?: boolean;
}

export interface ButtonProps {
  label: string;
  href: string;
  variant: "primary" | "secondary" | "outline" | "ghost";
  size: "sm" | "md" | "lg";
  align: "left" | "center" | "right";
  color: string;
  textColor: string;
}

export interface DividerProps {
  style: "solid" | "dashed" | "dotted";
  color: string;
  thickness: number;
}

export interface SpacerProps {
  height: number; // px
}

export interface VideoProps {
  src: string;
  poster: string;
  ratio: "16/9" | "4/3" | "1/1" | "9/16";
}

export interface QuoteProps {
  text: string;
  author: string;
  role: string;
  align: "left" | "center" | "right";
}

export interface ListProps {
  style: "bullet" | "number" | "check";
  items: string[];
}

export interface FormField {
  label: string;
  type: "text" | "email" | "textarea";
  required: boolean;
}

export interface FormProps {
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
}

export interface HtmlProps {
  html: string;
}

/**
 * Where a block sits relative to the blocks around it — the third dimension
 * the page never had.
 *
 * Everything on a page used to be in one flat stack: a text block dropped on
 * a picture pushed the picture down, and the picture pushed the text back,
 * because the only place either could be was after the other. A headline over
 * a photograph — the thing every hero section is — could not be built at all.
 *
 * Two pieces answer that. `level` says which of two overlapping blocks is in
 * front, and applies whether or not a block is floating. `mode: "float"`
 * lifts a block out of the flow so it takes no room of its own and sits over
 * whatever shares its container, placed by `x`, `y` and `width`.
 *
 * Absent — which is every block written before this existed — means a block
 * in the flow at level 0, i.e. exactly what the page did before.
 */
export interface BlockLayer {
  /**
   * "flow" keeps the block in the stack, taking its own room.
   * "float" takes it out, so it overlaps its neighbours instead of moving
   * them.
   */
  mode?: "flow" | "float";
  /**
   * Which block is drawn in front where two overlap. Higher is nearer the
   * reader; negative puts a block behind its neighbours. Blocks that share a
   * level fall back to the order they are in.
   */
  level?: number;
  /** Left edge, as a percentage of the width of the area it floats in. */
  x?: number;
  /** Top edge, as a percentage of the height of the area it floats in. */
  y?: number;
  /** How wide the block is, as a percentage of that same area. */
  width?: number;
}
