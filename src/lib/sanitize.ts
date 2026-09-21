import sanitizeHtmlLib from "sanitize-html";
import { isAllowedEmbed, normalizeEmbed, EMBED_ALLOW } from "./embed-hosts";
import { isSafeHref, sanitizeStyleAttribute } from "./security";

/**
 * Sanitize HTML using sanitize-html — a full HTML parser that cannot be
 * bypassed by regex tricks. Strips scripts, event handlers, javascript:
 * URLs, and dangerous elements while keeping safe formatting.
 *
 * Allowed: headings, text formatting, links, images, lists, tables, code,
 *          blockquotes, video, iframes (from trusted sources), divs, spans.
 * Stripped: <script>, on* handlers, javascript: URLs, <style>, <form>,
 *           <object>, <embed>, <foreignObject>, <use>.
 *
 * A `style` attribute survives, but not untouched: it is parsed and filtered
 * declaration by declaration (see `sanitizeStyleAttribute`). The header here
 * used to promise that CSS expressions were stripped, which was true of a
 * <style> element and false of every attribute in the document.
 */

/**
 * The prefix every `id` in somebody's content is given.
 *
 * Sanitised content is server-rendered before Next's own bootstrap script, so
 * an element called `__next_f` wins the name against
 * `self.__next_f = self.__next_f || []`. Every push then throws and React
 * never hydrates: on a published page that kills the forms and the menus, and
 * on the editor page for that site the entire builder is inert — every button
 * still in the HTML, not one of them wired to anything. An owner who accepted
 * an imported or agent-written footer could no longer repair the site through
 * the interface at all.
 *
 * Prefixing costs nothing an author will notice — an anchor still works,
 * because `href="#…"` is rewritten to match — and there is no name left that
 * content can collide with.
 */
const ID_PREFIX = "c-";

/** The attributes kept on an <iframe>, once the src has been vouched for. */
function embedAttributes(src: string): Record<string, string> {
  return {
    src,
    // The frame gets its own origin and may script itself and go full screen.
    // It does not get to navigate the page around it, submit forms into it,
    // or open windows — the export has no CSP to fall back on.
    sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups-to-escape-sandbox",
    // The `allow` attribute used to survive whatever it said, so a player
    // could ask the customer's visitors for the camera and the microphone.
    allow: EMBED_ALLOW,
    referrerpolicy: "strict-origin-when-cross-origin",
    loading: "lazy",
  };
}

/** Attributes carried over from the author's iframe, if they are dimensions. */
function keepDimensions(attribs: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of ["width", "height", "title"]) {
    if (attribs[name]) kept[name] = attribs[name];
  }
  return kept;
}

/**
 * The transform every element goes through, whatever its tag.
 *
 * `transformTags` is the only hook that sees an attribute before it is written
 * back out, which is why the `style`, `id` and `href` work all happens here
 * rather than in three allowlists.
 */
function transformAny(tagName: string, attribs: Record<string, string>) {
  const out: Record<string, string> = { ...attribs };

  if (out.style !== undefined) {
    const filtered = sanitizeStyleAttribute(out.style);
    if (filtered) out.style = filtered;
    else delete out.style;
  }

  if (out.id !== undefined) {
    const id = out.id.trim();
    if (id) out.id = `${ID_PREFIX}${id}`;
    else delete out.id;
  }

  return { tagName, attribs: out };
}

/** The shared options, so the two profiles below cannot drift apart. */
const COMMON = {
  disallowedTagsMode: "discard" as const,
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // `data:` is an image scheme here and nothing else. As a link scheme it
  // produced a download on click with no prompt for the visitor, and
  // `data:text/html` is a document on the customer's own domain in any
  // browser that still navigates to one.
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
    video: ["http", "https", "data"],
    source: ["http", "https", "data"],
  },
  allowedSchemesAppliedToAttributes: ["href", "src", "poster"],
};

export function sanitizeHtml(dirty: string): string {
  if (typeof dirty !== "string") return "";

  return sanitizeHtmlLib(dirty, {
    ...COMMON,
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "b", "i", "u", "s", "em", "strong", "mark", "small", "sub", "sup",
      "a", "img",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "table", "thead", "tbody", "tr", "th", "td",
      "div", "span", "figure", "figcaption",
      "video", "source",
      "iframe",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      video: ["src", "controls", "autoplay", "muted", "loop", "playsinline", "poster", "width", "height"],
      source: ["src", "type"],
      iframe: ["src", "width", "height", "title", "sandbox", "allow", "allowfullscreen", "referrerpolicy", "loading"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      "*": ["class", "id", "style"],
    },
    transformTags: {
      "*": transformAny,
      a: (tagName, attribs) => {
        const { attribs: base } = transformAny(tagName, attribs);
        const href = isSafeHref(base.href);
        if (href === undefined) delete base.href;
        else base.href = base.href?.startsWith("#") ? `#${ID_PREFIX}${href.slice(1)}` : href;

        // A new tab used to be handed a live reference to the page that
        // opened it. Current browsers imply this; saying it costs one token
        // and covers the export, which is read by whatever the visitor has.
        if (base.target === "_blank") base.rel = "noopener noreferrer";
        return { tagName, attribs: base };
      },
      iframe: (tagName, attribs) => {
        const src = normalizeEmbed(attribs.src);
        // `exclusiveFilter` below removes the element when there is no src to
        // keep; here we only have to make sure what is kept is the parsed
        // absolute form, never the author's protocol-relative spelling.
        if (!src) return { tagName, attribs: {} };
        return { tagName, attribs: { ...keepDimensions(attribs), ...embedAttributes(src) } };
      },
    },
    // Iframes only from the shared allowlist, matched on the whole hostname.
    exclusiveFilter: (frame) => frame.tag === "iframe" && !isAllowedEmbed(frame.attribs.src),
  });
}

/**
 * The profile for a rich-text prop — a heading, a paragraph, a list item, a
 * quote, a button's label.
 *
 * These are edited in a `contentEditable`, which means the browser's own
 * formatting commands write into them and the result is read straight back
 * out as `innerHTML`. Anything the editor accepted was therefore stored, and
 * anything stored was written back into the builder's own document the next
 * time the page was opened: a `<style>` element restyled the whole admin
 * interface, an `<img>` and a cross-origin `<iframe>` were fetched the moment
 * the editor loaded, and `<meta http-equiv="refresh">` navigated the tab away.
 * Only the nonce CSP stood between that and stored script on the origin that
 * holds every site.
 *
 * A paragraph of text needs none of that. This is what the formatting toolbar
 * can actually produce, and nothing else.
 */
export function sanitizeInlineHtml(dirty: string): string {
  if (typeof dirty !== "string") return "";

  return sanitizeHtmlLib(dirty, {
    ...COMMON,
    allowedTags: ["b", "i", "u", "s", "em", "strong", "mark", "sub", "sup", "a", "br", "span", "code"],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      span: ["class", "style"],
      "*": ["class", "style"],
    },
    transformTags: {
      "*": transformAny,
      a: (tagName, attribs) => {
        const { attribs: base } = transformAny(tagName, attribs);
        const href = isSafeHref(base.href);
        if (href === undefined) delete base.href;
        else base.href = base.href?.startsWith("#") ? `#${ID_PREFIX}${href.slice(1)}` : href;
        if (base.target === "_blank") base.rel = "noopener noreferrer";
        return { tagName, attribs: base };
      },
    },
  });
}
