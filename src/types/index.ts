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
  | "html"
  | "gallery"
  | "accordion"
  | "slider"
  | "audio"
  | "icon"
  | "social"
  | "table"
  | "pricing"
  | "map"
  | "code";

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
  /**
   * A YouTube or Vimeo link, which is drawn as that site's privacy-preserving
   * player (see `src/lib/video-embed.ts`), or the address of a video file,
   * which is drawn as a `<video>` element.
   */
  src: string;
  /** Shown before a video file starts. A YouTube or Vimeo player draws its own. */
  poster: string;
  ratio: "16/9" | "4/3" | "1/1" | "9/16";
  /**
   * What a screen reader calls the player. Empty means "YouTube video" or
   * "Vimeo video" for an embed, and no name of its own for a file.
   */
  title?: string;
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
  /** Inline HTML, so a privacy checkbox can link the notice from inside its sentence. */
  label: string;
  /** See `FORM_FIELD_TYPES` in `src/lib/form-fields.ts`. */
  type: "text" | "email" | "textarea" | "tel" | "number" | "date" | "select" | "radio" | "checkboxes" | "consent";
  required: boolean;
  /** Shown in an empty box; in a dropdown, the choice that means none yet. */
  placeholder?: string;
  /** A line beneath the field, read out with it. */
  help?: string;
  /** The answers a dropdown, a set of buttons or of tick boxes offers. */
  options?: string[];
}

export interface FormProps {
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
  /**
   * Where the form in a downloaded copy of the site sends its answers — a
   * form service's https address or `mailto:` — or "" for nowhere. The
   * builder's own pages always store answers in the builder.
   */
  destination?: string;
}

export interface HtmlProps {
  html: string;
}

/**
 * One picture in a gallery or a slider.
 *
 * It keeps what an image block keeps about its picture, for the same reasons:
 * a description a screen reader can read, the file's own size so the page
 * holds its space while it loads, and whether that description was borrowed
 * from the library — in which case choosing another picture replaces it,
 * because it described the one being swapped out.
 */
export interface MediaItem {
  src: string;
  alt: string;
  caption?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  altFromLibrary?: boolean;
}

export interface GalleryProps {
  images: MediaItem[];
  columns: 2 | 3 | 4;
  gap: number; // px
  /** How each tile is cropped. "natural" keeps every picture's own shape. */
  aspect: "square" | "landscape" | "portrait" | "natural";
  rounded: "none" | "md" | "xl";
  /** Whether a picture opens large over the page when it is clicked. */
  lightbox: boolean;
}

export interface AccordionItem {
  /** The line that is always showing. Inline HTML. */
  title: string;
  /** What opens beneath it. Inline HTML. */
  body: string;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Opening one item closes whichever other one was open. */
  exclusive: boolean;
  /** The first item starts open rather than closed. */
  openFirst: boolean;
  style: "bordered" | "separated" | "minimal";
}

export interface SliderProps {
  slides: MediaItem[];
  ratio: "16/9" | "4/3" | "1/1" | "21/9";
  rounded: "none" | "md" | "xl";
  showArrows: boolean;
  showDots: boolean;
}

export interface AudioProps {
  /**
   * A file from the library (`/uploads/…`), which the download carries with
   * it, or an https address somebody typed, which it does not. Empty draws
   * nothing on the published page.
   */
  src: string;
  /** What is playing — "Episode 4 — The long winter". Inline HTML. */
  title: string;
  /** A line or two under the title. Optional, inline HTML. */
  description: string;
}

export interface IconProps {
  /** A name from the bundled set in `src/lib/icon-names.ts`. */
  icon: string;
  size: "sm" | "md" | "lg" | "xl";
  /** Empty means the site's accent. */
  color: string;
  shape: "none" | "circle" | "square";
  /**
   * Both optional. With either one set, the icon is the head of a small
   * feature card rather than a picture on its own.
   */
  title: string;
  text: string;
  align: "left" | "center" | "right";
}

export type SocialNetwork =
  | "instagram"
  | "facebook"
  | "x"
  | "linkedin"
  | "youtube"
  | "tiktok"
  | "github"
  | "mastodon"
  | "bluesky"
  | "pinterest"
  | "threads"
  | "whatsapp"
  | "email"
  | "website";

export interface SocialLink {
  network: SocialNetwork;
  href: string;
}

export interface SocialProps {
  links: SocialLink[];
  size: "sm" | "md" | "lg";
  shape: "none" | "circle" | "square";
  /** Empty means the page's text colour. */
  color: string;
  align: "left" | "center" | "right";
}

export interface TableProps {
  /**
   * The cells, a row at a time, as inline HTML. Rows may differ in length in
   * storage; the widest row decides how many columns are drawn.
   */
  rows: string[][];
  /** The first row is headings rather than data. */
  headerRow: boolean;
  /** The first cell of every row labels that row. */
  headerColumn: boolean;
  striped: boolean;
  caption: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  buttonLabel: string;
  buttonHref: string;
  /** Drawn raised and in the accent, as the plan most people should pick. */
  highlighted: boolean;
  /** A short tag above a plan — "Most popular". Empty draws none. */
  badge: string;
}

export interface PricingProps {
  plans: PricingPlan[];
  /** The highlighted plan's colour. Empty means the site's accent. */
  color: string;
}

export interface MapProps {
  /** What a visitor reads: a street address or the name of a place. */
  address: string;
  lat: number;
  lng: number;
  zoom: number;
  /**
   * "card" draws the address with a link that opens it on a map, and asks
   * nothing of anybody else's server. "embed" shows an OpenStreetMap frame,
   * which every visitor's browser fetches from openstreetmap.org as the page
   * opens — something the privacy notice then has to say.
   */
  mode: "card" | "embed";
  /** How tall the embedded map is drawn, in px. */
  height: number;
  /**
   * The words on the link to OpenStreetMap. A prop rather than a fixed
   * English phrase because the page it sits on may be written in German;
   * empty reads as the default for the mode ("Open in OpenStreetMap", "Open
   * larger map").
   */
  linkLabel: string;
  /** Whether a second link opens the same place on Google Maps. */
  googleLink: boolean;
  /** The words on that link; empty reads as "Open in Google Maps". */
  googleLabel: string;
}

export interface CodeProps {
  /** Plain text, never HTML: it is shown exactly as written. */
  code: string;
  language: string;
  filename: string;
  theme: "dark" | "light";
  /** Long lines wrap rather than scroll sideways. */
  wrap: boolean;
  lineNumbers: boolean;
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
