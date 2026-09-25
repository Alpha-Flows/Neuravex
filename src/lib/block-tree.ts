import { z } from "zod";
import type { BaseBlock } from "@/types";
import { isSafeHref } from "./url-safety";
import { sanitizeStyleAttribute } from "./css-safety";
import { sanitizeInlineHtml, sanitizeHtml } from "./sanitize";
import { cssColor, cssLength } from "./css-value";
import { normalizeLayer } from "./block-layer";
import { resolveIconName } from "./icon-names";
import { MAX_SOCIAL_HREF, MAX_SOCIAL_LINKS, normaliseSocialHref } from "./social-links";
import { MAX_CODE } from "./code-lines";

/**
 * What a block tree is allowed to be, checked at every door.
 *
 * Until now there was no answer to that question anywhere. The editor's save,
 * the PATCH route, the site import and the MCP server's `save_page` all took
 * whatever they were handed — `props: z.record(z.string(), z.unknown())` was
 * the strongest of the four — and stored it. Everything downstream then
 * assumed it was well-formed:
 *
 *   - `List` maps `props.items`, `Form` maps `props.fields`. A string where an
 *     array was expected throws inside the renderer, and there is no
 *     error.tsx anywhere, so the editor and the published page both became a
 *     durable 500 the owner could not click past to repair.
 *   - A `null` node was worse: creating a new page reads its siblings to pick
 *     a starting look, and crashed, so no new page could be made on that site.
 *   - `sortOrder: 1e12` went into a 32-bit column. SQLite stored it happily,
 *     and every later read of the row threw.
 *   - Nothing capped depth. About 200 levels broke the editor, 400 the public
 *     page, 8000 the legal audit and the download — a stack overflow with,
 *     again, nothing to click.
 *
 * So this module is the one description of a valid tree, and the write paths
 * all go through it. It does two jobs at once, because they need the same
 * walk: it refuses what cannot be stored, and it neutralises what can be
 * stored but should not be trusted — a `javascript:` href, an unfiltered
 * `style`, a colour with a second declaration hidden in it.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Generous for a page somebody wrote; finite, which is the point. */
export const MAX_DEPTH = 32;
export const MAX_NODES = 5000;
export const MAX_TREE_BYTES = 4 * 1024 * 1024;

/** The 32-bit column `sortOrder` is stored in. */
export const MAX_SORT_ORDER = 2 ** 31 - 1;

/** Long enough for a page of prose in one block, short enough to bound a row. */
const MAX_TEXT = 100_000;
const MAX_HTML = 200_000;
const MAX_ITEMS = 500;

// ---------------------------------------------------------------------------
// Shared field validators
// ---------------------------------------------------------------------------

/** An integer the `Int` columns can actually hold. */
export function clampSortOrder(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_SORT_ORDER);
}

/**
 * A media reference — an image, a video, a poster.
 *
 * The same scheme rule as a link, minus `mailto:` and `tel:`, which are not
 * things a picture can be. `data:` is allowed for an inline image because the
 * clipboard paste path produces one, but only for an image type.
 */
function safeMediaSrc(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^data:/i.test(trimmed)) {
    return /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);/i.test(trimmed) ? trimmed : undefined;
  }
  const href = isSafeHref(trimmed);
  if (href === undefined) return undefined;
  return /^(?:mailto|tel):/i.test(href) ? undefined : href;
}

/**
 * A string prop, cut to a length a database row can hold.
 *
 * Cut, not emptied. This was `z.string().max(max).catch("")`, so one
 * character over the limit threw the whole value away: a slide's
 * description pasted at 1,200 characters came back as `alt=""`, and the
 * picture was announced to a screen reader as decoration. Nothing told the
 * author either way.
 */
const text = (max = MAX_TEXT) =>
  z.unknown().optional().transform((v) => (typeof v === "string" ? v.slice(0, max) : ""));

// ---------------------------------------------------------------------------
// Per-type prop schemas
// ---------------------------------------------------------------------------

/**
 * Every schema below is written to repair rather than reject where it safely
 * can — `.catch()` on a field means a mistyped prop falls back to a sensible
 * value instead of failing the whole save and losing the author's other work.
 * What cannot be repaired (a tree that is not an array, a node that is not an
 * object, a depth past the limit) is refused outright.
 */
const align = z.enum(["left", "center", "right"]).catch("left");
const colorProp = z.string().max(200).transform((v) => cssColor(v) ?? "").catch("");
const lengthProp = (fallback: number) =>
  z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)).pipe(z.number().min(-10_000).max(10_000).catch(fallback));

/**
 * Inline HTML, sanitised and no longer than `max` — measured after sanitising.
 *
 * It was measured before, and sanitising makes text longer: `&` is written
 * back as `&amp;` and `<br>` as `<br />`. So a save stored more than the limit,
 * both read paths cut it again, and a 20,000-character FAQ answer written with
 * ampersands came back from the published page at half its length, ending in
 * `x&` where an entity had been cut in two — and the editor, which reads
 * through the same door, saved the shortened copy the next time. The cut now
 * falls on what is stored, clear of a tag or an entity, so a second pass over
 * the result leaves it exactly as it is.
 */
function clampInlineHtml(value: string, max: number): string {
  let out = sanitizeInlineHtml(value.slice(0, max));
  let room = max;
  while (out.length > max && room > 0) {
    let cut = out.slice(0, room);
    const tag = cut.lastIndexOf("<");
    if (tag > cut.lastIndexOf(">")) cut = cut.slice(0, tag);
    const entity = cut.lastIndexOf("&");
    if (entity > cut.lastIndexOf(";")) cut = cut.slice(0, entity);
    out = sanitizeInlineHtml(cut);
    // Cutting inside an element leaves it open and the sanitiser closes it
    // again, which adds a few characters back; the next try leaves room for
    // them. `room` shrinks every time round, so this ends.
    room = cut.length - Math.max(1, out.length - max);
  }
  return out.length > max ? "" : out;
}

const inlineText = (max = MAX_TEXT) =>
  z.unknown().optional().transform((v) => (typeof v === "string" ? clampInlineHtml(v, max) : ""));

/**
 * Inline HTML for words a block draws inside a link of its own — a button's
 * label, a map's "Open in OpenStreetMap".
 *
 * The formatting toolbar can link any words it is given, and a link inside a
 * link is not HTML: the parser closes the outer one before the inner one
 * begins. On the published page React saw a different tree from the one it
 * had drawn and rebuilt the whole page in the browser; in the downloaded
 * copy, which has no script to rebuild anything, a pricing plan's button came
 * out as an empty coloured bar with its label underneath as a bare link. The
 * words stay; only the link around them goes. It runs on the sanitiser's own
 * output, whose tags are regular enough for a pattern to find.
 */
const linkLabel = (max: number) => inlineText(max).transform((v) => v.replace(/<\/?a\b[^>]*>/gi, ""));

const flag = (fallback: boolean) => z.boolean().catch(fallback);

/**
 * A list of records, each one repaired on its own and the list cut to length.
 *
 * `z.array(...).max(n).catch([])` is the obvious way to write this, and it is
 * what the list and form schemas above do — but there one entry too many
 * empties the whole list, and one entry that is not an object turns into a
 * blank row that was never written. A gallery of forty pictures with one bad
 * entry should come back as thirty-nine pictures, and a gallery of five
 * hundred as the first sixty, not as nothing.
 *
 * The cap counts entries kept, not entries read. It first counted entries
 * read, so a pricing block holding four broken plans and then a good one came
 * back with no plans at all: the good one was the fifth, and only four were
 * ever looked at. How far past the cap it will look is still bounded, though —
 * a four-megabyte page can hold two million `0`s, and parsing every one to
 * find sixty pictures is work somebody else gets to ask for.
 */
function listOf<T extends z.ZodType>(item: T, max: number) {
  return z.unknown().optional().transform((value) => {
    const out: z.output<T>[] = [];
    if (!Array.isArray(value)) return out;
    const scan = Math.min(value.length, max * 4 + 16);
    for (let i = 0; i < scan && out.length < max; i++) {
      const parsed = item.safeParse(value[i]);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  });
}

/** One picture in a gallery or a slider, checked the way an image block's is. */
const mediaItem = z.object({
  src: z.unknown().optional().transform((v) => safeMediaSrc(v) ?? ""),
  alt: text(1000),
  caption: inlineText(2000),
  naturalWidth: z.coerce.number().int().min(0).max(100_000).optional().catch(undefined),
  naturalHeight: z.coerce.number().int().min(0).max(100_000).optional().catch(undefined),
  altFromLibrary: z.boolean().optional().catch(undefined),
});

const MAX_GALLERY_IMAGES = 60;
const MAX_SLIDES = 30;
const MAX_ACCORDION_ITEMS = 100;
export const MAX_TABLE_ROWS = 200;
export const MAX_TABLE_COLUMNS = 12;
export const MAX_PRICING_PLANS = 4;
export const MAX_PLAN_FEATURES = 30;
/**
 * The networks a social link can name. Kept as a list here, beside the schema
 * that checks it, rather than read from the table of drawings, so this file
 * stays the one place that says what a stored tree may hold; a test holds the
 * two lists to each other, so a network cannot be allowed without a drawing.
 */
export const SOCIAL_NETWORKS = [
  "instagram", "facebook", "x", "linkedin", "youtube", "tiktok", "github", "mastodon",
  "bluesky", "pinterest", "threads", "whatsapp", "email", "website",
] as const;

const PROPS: Record<string, z.ZodType> = {
  heading: z.object({
    text: inlineText(),
    level: z.coerce.number().int().min(1).max(4).catch(2),
    align,
    color: colorProp,
    weight: z.enum(["normal", "medium", "semibold", "bold"]).catch("bold"),
    size: z.coerce.number().int().min(1).max(4).optional().catch(undefined),
  }),

  text: z.object({
    text: inlineText(),
    align: z.enum(["left", "center", "right", "justify"]).catch("left"),
    size: z.enum(["sm", "base", "lg", "xl"]).catch("base"),
    color: colorProp,
  }),

  image: z.object({
    src: z.unknown().optional().transform((v) => safeMediaSrc(v) ?? ""),
    alt: text(1000),
    rounded: z.enum(["none", "md", "xl", "full"]).catch("none"),
    width: z.enum(["small", "medium", "large", "full"]).catch("large"),
    caption: inlineText(2000),
    naturalWidth: z.coerce.number().int().min(0).max(100_000).optional().catch(undefined),
    naturalHeight: z.coerce.number().int().min(0).max(100_000).optional().catch(undefined),
    altFromLibrary: z.boolean().optional().catch(undefined),
  }),

  button: z.object({
    // Drawn inside the button's own link; see `linkLabel`.
    label: linkLabel(1000),
    // The whole of NVX-001: nothing checked this, so a `javascript:` href
    // from an import, a paste or the MCP server was stored, published and
    // copied into the customer's download, where there is no CSP to stop it.
    href: z.unknown().optional().transform((v) => isSafeHref(v) ?? "#"),
    variant: z.enum(["primary", "secondary", "outline", "ghost"]).catch("primary"),
    size: z.enum(["sm", "md", "lg"]).catch("md"),
    align,
    color: colorProp,
    textColor: colorProp,
  }),

  divider: z.object({
    style: z.enum(["solid", "dashed", "dotted"]).catch("solid"),
    color: colorProp,
    thickness: lengthProp(1),
  }),

  spacer: z.object({ height: lengthProp(40) }),

  section: z.object({
    background: colorProp,
    backgroundImage: z.unknown().optional().transform((v) => safeMediaSrc(v)).optional(),
    backgroundOverlay: colorProp.optional(),
    paddingY: lengthProp(64),
    paddingX: lengthProp(24),
    maxWidth: z.enum(["site", "full", "7xl", "6xl", "5xl", "4xl"]).catch("site"),
    align,
  }),

  columns: z.object({
    count: z.coerce.number().int().min(2).max(4).catch(2),
    gap: lengthProp(24),
    columnStyles: z
      .array(
        z.object({
          background: colorProp.optional(),
          backgroundImage: z.unknown().optional().transform((v) => safeMediaSrc(v)).optional(),
          backgroundOverlay: colorProp.optional(),
          padding: lengthProp(0).optional(),
          radius: lengthProp(0).optional(),
        }).catch({}),
      )
      .max(4)
      .optional()
      .catch(undefined),
  }),

  video: z.object({
    // A <video> element, so any http(s) file is a legitimate source; what is
    // not legitimate is a scheme that runs something. A YouTube or Vimeo link
    // is stored as the author pasted it and turned into a player address at
    // render by `videoEmbed`, which builds that address from scratch — so
    // nothing of the stored link but a checked id, a start time and Vimeo's
    // hash ever reaches the frame.
    src: z.unknown().optional().transform((v) => safeMediaSrc(v) ?? ""),
    poster: z.unknown().optional().transform((v) => safeMediaSrc(v) ?? ""),
    ratio: z.enum(["16/9", "4/3", "1/1", "9/16"]).catch("16/9"),
    // Plain text for a `title` or `aria-label` attribute, never markup, and
    // cut to length rather than emptied. Angle brackets are dropped because
    // the privacy audit reads every prop called `title` as rich text: a
    // title of `<img src=https://x.example/>` was never going to be drawn as
    // an image, but the audit would have named x.example in the privacy
    // notice all the same.
    title: z
      .unknown()
      .optional()
      .transform((v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, 300) : "")),
  }),

  quote: z.object({
    text: inlineText(),
    author: inlineText(500),
    role: inlineText(500),
    align,
  }),

  list: z.object({
    style: z.enum(["bullet", "number", "check"]).catch("bullet"),
    // `List` maps over this. A string here used to throw inside the renderer.
    items: z.array(inlineText(5000)).max(MAX_ITEMS).catch([]),
  }),

  form: z.object({
    // Same shape of failure as `items`, on the block that takes visitor data.
    fields: z
      .array(
        z.object({
          label: text(500),
          type: z.enum(["text", "email", "textarea"]).catch("text"),
          required: z.boolean().catch(false),
        }).catch({ label: "", type: "text" as const, required: false }),
      )
      .max(100)
      .catch([]),
    submitLabel: text(200),
    successMessage: text(2000),
  }),

  html: z.object({
    // Stored sanitised, not only sanitised at render: the editor reads this
    // back into a contentEditable, and the export writes it into a file the
    // builder's CSP never sees.
    html: z.unknown().optional().transform((v) => (typeof v === "string" ? sanitizeHtml(v.slice(0, MAX_HTML)) : "")),
  }),

  gallery: z.object({
    images: listOf(mediaItem, MAX_GALLERY_IMAGES),
    // Brought into range rather than sent back to the default: somebody who
    // asked for six columns wants as many as there are, not three. The gap
    // was a `lengthProp`, which keeps anything within ±10,000px — a negative
    // gap is one CSS throws away, and a gap of several hundred pixels leaves
    // a gallery with more gap in it than picture.
    columns: z.coerce.number().transform((n) => Math.min(Math.max(Math.round(n), 2), 4)).catch(3),
    gap: z.coerce.number().transform((n) => Math.min(Math.max(Math.round(n), 0), 64)).catch(12),
    aspect: z.enum(["square", "landscape", "portrait", "natural"]).catch("square"),
    rounded: z.enum(["none", "md", "xl"]).catch("md"),
    lightbox: flag(true),
  }),

  accordion: z.object({
    items: listOf(z.object({ title: inlineText(1000), body: inlineText(20_000) }), MAX_ACCORDION_ITEMS),
    exclusive: flag(false),
    openFirst: flag(false),
    style: z.enum(["bordered", "separated", "minimal"]).catch("bordered"),
  }),

  slider: z.object({
    slides: listOf(mediaItem, MAX_SLIDES),
    ratio: z.enum(["16/9", "4/3", "1/1", "21/9"]).catch("16/9"),
    rounded: z.enum(["none", "md", "xl"]).catch("xl"),
    showArrows: flag(true),
    showDots: flag(true),
  }),

  audio: z.object({
    // An <audio> element, so the rule is the video block's: any http(s) file
    // or one of this site's own, and never a scheme that runs something.
    // Stricter than a picture's in one way: `safeMediaSrc` lets a `data:`
    // image through because the clipboard pastes pictures that way, and no
    // path in the builder produces a sound like that. A `data:` source here
    // could only be a whole file stuffed into the page's row, copied into
    // every revision and past the upload route's size cap and content check.
    src: z.unknown().optional().transform((v) => {
      const src = safeMediaSrc(v);
      return src && !/^data:/i.test(src) ? src : "";
    }),
    title: inlineText(300),
    description: inlineText(2000),
  }),

  icon: z.object({
    // A name from the bundled set, one lucide used to spell differently, or
    // the star — never nothing, because an empty box is a gap nobody can see
    // to go and fix. See `icon-names.ts`.
    icon: z.unknown().optional().transform(resolveIconName),
    size: z.enum(["sm", "md", "lg", "xl"]).catch("md"),
    color: colorProp,
    shape: z.enum(["none", "circle", "square"]).catch("circle"),
    title: inlineText(300),
    text: inlineText(2000),
    align,
  }),

  social: z.object({
    links: listOf(
      z
        .object({
          network: z.enum(SOCIAL_NETWORKS).catch("website"),
          href: z.unknown().optional(),
        })
        // Every one of these is a link on the customer's published page, so
        // it gets the button's rule: http(s), mailto:, tel:, a path, nothing
        // that runs. It is finished first the way the inspector would have
        // finished it — `hello@example.com` under Email becomes a `mailto:`,
        // `@you` under Instagram an Instagram address — because the MCP
        // server and an import write here without the inspector, and stored
        // as typed either one is a relative link to a 404 on the author's
        // own site. That only ever adds a scheme, so it runs before the
        // scheme is judged and never around it. An address longer than any
        // profile's is not kept at all: stored, it would be read again on
        // every save and every visit (see `MAX_SOCIAL_HREF`).
        .transform(({ network, href }) => ({
          network,
          href:
            typeof href === "string" && href.length <= MAX_SOCIAL_HREF
              ? (isSafeHref(normaliseSocialHref(network, href)) ?? "")
              : "",
        })),
      MAX_SOCIAL_LINKS,
    ),
    size: z.enum(["sm", "md", "lg"]).catch("md"),
    shape: z.enum(["none", "circle", "square"]).catch("circle"),
    color: colorProp,
    align,
  }),

  table: z.object({
    // A row and a cell are repaired differently, because losing one costs
    // different things. A row that is not a list was never a row, so it is
    // dropped and the rows around it close up — except a bare string, which is
    // what an import or an agent writes when it means a row of one cell. A
    // cell is never dropped: taking one out of the middle of a row would slide
    // every cell after it into the wrong column, and a price list would put
    // its prices under the heading for sizes. A cell that is not text becomes
    // an empty one instead, and a number — a price, a quantity — is written
    // out rather than lost. Rows are left the lengths they arrived; the table
    // pads them to its widest row when it draws, so nothing here invents a
    // cell.
    rows: listOf(
      z
        .unknown()
        .refine((row) => Array.isArray(row) || typeof row === "string")
        .transform((row): unknown => (typeof row === "string" ? [row] : row))
        .pipe(
          listOf(
            z.preprocess((cell) => (typeof cell === "number" && Number.isFinite(cell) ? String(cell) : cell), inlineText(5000)),
            MAX_TABLE_COLUMNS,
          ),
        ),
      MAX_TABLE_ROWS,
    ),
    headerRow: flag(true),
    headerColumn: flag(false),
    striped: flag(true),
    caption: inlineText(1000),
  }),

  pricing: z.object({
    plans: listOf(
      z.object({
        name: inlineText(200),
        price: inlineText(100),
        period: inlineText(100),
        description: inlineText(1000),
        // A feature that is not a string is dropped rather than repaired.
        // `inlineText` turns anything else into "", and on a plan card that
        // would be a tick beside nothing — a line the author never wrote.
        features: listOf(z.string().transform((v) => clampInlineHtml(v, 1000)), MAX_PLAN_FEATURES),
        // Drawn inside the plan's own button link; see `linkLabel`.
        buttonLabel: linkLabel(200),
        buttonHref: z.unknown().optional().transform((v) => isSafeHref(v) ?? "#"),
        highlighted: flag(false),
        badge: inlineText(100),
      }),
      MAX_PRICING_PLANS,
    ),
    color: colorProp,
  }),

  map: z.object({
    address: inlineText(500),
    // A number, or a string that is one. `z.coerce.number()` read an empty
    // field as 0, which is a real latitude — a pin off the coast of Ghana in
    // place of the one the author had — so "" falls back instead. Six
    // decimals is ten centimetres, finer than any front door.
    lat: z.union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number().min(-90).max(90))
      .transform((v) => Math.round(v * 1e6) / 1e6)
      .catch(52.5163),
    lng: z.union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number().min(-180).max(180))
      .transform((v) => Math.round(v * 1e6) / 1e6)
      .catch(13.3777),
    // Clamped rather than refused: 21 from a Google link means "as close as
    // it goes", and OpenStreetMap's closest is 19.
    zoom: z.union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number())
      .transform((v) => Math.min(19, Math.max(1, Math.round(v))))
      .catch(16),
    mode: z.enum(["card", "embed"]).catch("card"),
    height: z.union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number())
      .transform((v) => Math.min(900, Math.max(160, Math.round(v))))
      .catch(360),
    // Empty is allowed and means the mode's own wording, so a block stored
    // before these existed draws the links it always did. Both are drawn
    // inside a link of their own; see `linkLabel`.
    linkLabel: linkLabel(200),
    googleLink: flag(true),
    googleLabel: linkLabel(200),
  }),

  code: z.object({
    // Plain text. React writes it out escaped, so a sample of HTML is shown
    // as HTML rather than becoming part of the page — which is why this is
    // not sanitised: sanitising it would change the sample.
    //
    // Cut to length rather than emptied. `text()` answers a string one
    // character over its limit with "", which for a sample pasted in from a
    // long file lost all of it instead of its tail. Line endings are made
    // `\n` here because a text box reports nothing else: a sample stored with
    // `\r\n` read back into the editor differed from it on every line, and
    // the first keystroke rewrote all of them.
    code: z.unknown().optional().transform((v) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, MAX_CODE) : "")),
    language: z.unknown().optional().transform((v) => (typeof v === "string" ? v.trim().slice(0, 40) : "")),
    // One line in the header bar, so a newline in it is a space.
    filename: z.unknown().optional().transform((v) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").slice(0, 200) : "")),
    theme: z.enum(["dark", "light"]).catch("dark"),
    wrap: flag(false),
    lineNumbers: flag(false),
  }),
};

export const BLOCK_TYPES = Object.keys(PROPS);

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

export interface TreeProblem {
  /** What to tell the caller; safe to put in a 400 body. */
  message: string;
}

export type TreeResult =
  | { ok: true; tree: BaseBlock[] }
  | { ok: false; error: string };

interface Budget {
  nodes: number;
  bytes: number;
  /** Every id handed out so far in this tree. */
  ids: Set<string>;
}

function normalizeNode(node: unknown, depth: number, budget: Budget): BaseBlock | null {
  if (depth > MAX_DEPTH) return null;
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  if (++budget.nodes > MAX_NODES) return null;
  // Counted as we go rather than measured at the end: 5000 nodes each holding
  // the maximum text is half a gigabyte, and the point is not to build it.
  if (budget.bytes > MAX_TREE_BYTES) return null;

  const raw = node as Record<string, unknown>;
  const type = typeof raw.type === "string" ? raw.type : "";
  const schema = PROPS[type];
  if (!schema) return null;

  const parsed = schema.safeParse(
    raw.props && typeof raw.props === "object" && !Array.isArray(raw.props) ? raw.props : {},
  );
  // Every schema above repairs what it can, so a failure here is a shape no
  // fallback covers — drop the node rather than the page.
  if (!parsed.success) return null;

  const out: BaseBlock = {
    // A second block with an id already in this tree gets a new one. Nothing
    // made ids unique — an import, a paste into the JSON, or an agent naming
    // its blocks "pricing" twice all could — and two blocks sharing one are
    // selected together in the editor and draw the same anchors and labels
    // on the page, so a lightbox or a plan's button speaks for the wrong one.
    id: typeof raw.id === "string" && raw.id.length <= 128 && !budget.ids.has(raw.id) ? raw.id : cryptoId(),
    type: type as BaseBlock["type"],
    props: parsed.data,
  };
  budget.ids.add(out.id);

  if (Array.isArray(raw.children)) {
    const children = raw.children
      .map((child) => normalizeNode(child, depth + 1, budget))
      .filter((child): child is BaseBlock => child !== null);
    if (children.length > 0) out.children = children;
  }

  if (typeof raw.column === "number" && Number.isFinite(raw.column)) {
    out.column = Math.min(Math.max(Math.trunc(raw.column), 0), 3);
  }

  // Depth. A stored layer is three numbers and an enum, and every one of them
  // goes into an inline style, so they are clamped here rather than trusted:
  // an imported page could otherwise carry `zIndex: 1e12`, which lifts a block
  // over the builder's own chrome, or a `width` React would write out as
  // `NaN%`. A layer that says nothing is left off entirely.
  const layer = normalizeLayer(raw.layer);
  if (layer) out.layer = layer;

  budget.bytes += JSON.stringify(out.props).length + out.type.length + out.id.length;
  return out;
}

/** A block id for a node that arrived without a usable one. */
function cryptoId(): string {
  return `b${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * A block tree, or the reason there isn't one.
 *
 * Nodes that cannot be understood are dropped; a tree that cannot be
 * understood at all is refused, so the caller can answer 400 instead of
 * storing something the renderer will die on.
 */
export function normalizeBlockTree(input: unknown): TreeResult {
  let value = input;

  // The PATCH route stores `content` as a string, the save route as an object.
  if (typeof value === "string") {
    if (value.length > MAX_TREE_BYTES) return { ok: false, error: "That page is larger than Neuravex will store." };
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: "That page's content is not valid JSON." };
    }
  }

  if (!Array.isArray(value)) return { ok: false, error: "A page's content has to be a list of blocks." };
  if (value.length > MAX_NODES) return { ok: false, error: "That page has more blocks than Neuravex will store." };

  const budget: Budget = { nodes: 0, bytes: 0, ids: new Set() };
  const tree = value
    .map((node) => normalizeNode(node, 1, budget))
    .filter((node): node is BaseBlock => node !== null);

  if (budget.nodes > MAX_NODES) {
    return { ok: false, error: "That page has more blocks than Neuravex will store." };
  }
  if (budget.bytes > MAX_TREE_BYTES) {
    return { ok: false, error: "That page is larger than Neuravex will store." };
  }

  return { ok: true, tree };
}

/** The same thing, as the JSON string the `content` column holds. */
export function normalizeBlockTreeJson(input: unknown): { ok: true; json: string } | { ok: false; error: string } {
  const result = normalizeBlockTree(input);
  return result.ok ? { ok: true, json: JSON.stringify(result.tree) } : result;
}

/**
 * The last line of defence, at render.
 *
 * Rows written before any of this existed are still in people's databases, and
 * a renderer that trusts its props is one bad row away from a 500 with no
 * error boundary to catch it. This is cheap: a parse of one node's props.
 */
export function safeProps<T>(type: string, props: unknown, fallback: T): T {
  const schema = PROPS[type];
  if (!schema) return fallback;
  const parsed = schema.safeParse(props && typeof props === "object" ? props : {});
  return parsed.success ? (parsed.data as T) : fallback;
}

export { sanitizeStyleAttribute, cssColor, cssLength };
