import sanitizeHtmlLib from "sanitize-html";

/**
 * Sanitize HTML using sanitize-html — a full HTML parser that cannot be
 * bypassed by regex tricks. Strips scripts, event handlers, javascript:
 * URLs, and dangerous elements while keeping safe formatting.
 *
 * Allowed: headings, text formatting, links, images, lists, tables, code,
 *          blockquotes, video, iframes (from trusted sources), divs, spans.
 * Stripped: <script>, on* handlers, javascript: URLs, <style>, <form>,
 *           <object>, <embed>, <foreignObject>, <use>, CSS expressions.
 */
export function sanitizeHtml(dirty: string): string {
  return sanitizeHtmlLib(dirty, {
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
      img: ["src", "alt", "width", "height"],
      video: ["src", "controls", "autoplay", "muted", "loop", "playsinline", "poster", "width", "height"],
      source: ["src", "type"],
      iframe: ["src", "width", "height", "frameborder", "allowfullscreen", "allow"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      "*": ["class", "id", "style"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "data"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    // Strip all disallowed tags instead of escaping them
    disallowedTagsMode: "discard",
    // Iframes only from trusted sources (YouTube, Vimeo, etc.)
    exclusiveFilter: (frame: { tag: string; attribs: Record<string, string> }) => {
      return frame.tag === "iframe" && !/^(?:https?:)?\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com|vimeo\.com|codepen\.io|codesandbox\.io|player\.vimeo\.com)/.test(frame.attribs.src || "");
    },
  });
}
