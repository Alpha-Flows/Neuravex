/**
 * What this site actually does with a visitor's data.
 *
 * A privacy notice generator normally works by asking. "Do you use Google
 * Analytics? Do you embed YouTube?" — and whatever is ticked gets a section,
 * whether or not the site does it, which is how sites end up declaring
 * processing they do not carry out and omitting the one embed somebody pasted
 * into a Custom HTML block two years ago.
 *
 * This app can look instead. The pages are a block tree it owns, so the
 * things that reach outside the visitor's browser — a picture served from
 * somebody else's domain, an embedded video, an iframe in a custom HTML
 * block — can be found rather than asked about. What is found decides which
 * sections the Datenschutzerklärung gets, and is shown to the operator as a
 * list of what was detected, because a thing the program can see is a thing
 * they should see too.
 *
 * What it cannot see, it still has to ask: who the host is, what becomes of a
 * form submission, whether a data protection officer was appointed. Those
 * live on the profile.
 */

import { Parser } from "htmlparser2";
import { BaseBlock } from "@/types";
import { sanitizeHtml, sanitizeInlineHtml } from "@/lib/sanitize";
import { VIDEO_PROVIDER_NAME, videoEmbed, videoSiteOf } from "@/lib/video-embed";
import { osmEmbedUrl, osmTileHosts } from "@/lib/map-location";
import { richTextValues } from "@/lib/rich-text-props";

export type FindingKind =
  /** A form that can take personal data from a visitor. */
  | "form"
  /** A picture, font or file served from somebody else's domain. */
  | "remote-asset"
  /** A video hosted elsewhere and played in the page. */
  | "remote-video"
  /** An iframe, script or object inside a custom HTML block. */
  | "embed"
  /** An external address in the site's own header or footer HTML. */
  | "chrome-remote"
  /**
   * A plain hyperlink to somebody else's site.
   *
   * Listed separately and never counted as a remote host. A link is followed
   * when a visitor clicks it, so it transmits nothing on page load — but
   * `href` used to be scanned like `src`, so a footer link to Instagram
   * produced a "chrome-remote" finding, made the whole site
   * `selfContained: false`, and put a paragraph in the
   * Datenschutzerklärung saying the visitor's IP is sent to that host when
   * the page opens. That is the opposite failure from missing a tracker, and
   * it is just as wrong.
   */
  | "outbound-link";

export interface Finding {
  kind: FindingKind;
  /** The host the data goes to, when there is one. */
  host?: string;
  /** Where it was found — a page title, or the site's header/footer. */
  where: string;
  /** What exactly, e.g. the URL or the block type. */
  detail: string;
  /**
   * True when this needs more than a mention: loading a resource from another
   * server hands that server the visitor's IP address before they have agreed
   * to anything, and an embed that writes to the device engages § 25 Abs. 1
   * TDDDG. Neuravex ships no consent banner, so the honest answer is to tell
   * the operator rather than to generate a sentence that papers over it.
   */
  needsConsent: boolean;
}

export interface SiteAudit {
  findings: Finding[];
  /** True when any page carries a form block. */
  hasForm: boolean;
  /** Every outside host the site loads from as a page opens, deduplicated. */
  remoteHosts: string[];
  /**
   * Every outside host the site links to. Shown to the operator, and kept out
   * of `remoteHosts`: nothing is transmitted until a visitor clicks.
   */
  linkHosts: string[];
  /** True when nothing on the site reaches outside the visitor's browser. */
  selfContained: boolean;
}

/**
 * A host no address can really name, standing in for this site.
 *
 * `.invalid` is reserved for exactly this (RFC 2606): nothing an author writes
 * can resolve to it, so an address that comes back with it as its host was a
 * path on this site all along.
 */
const THIS_SITE = "https://self.invalid/";

/**
 * The host of an address somebody else serves, or null for one on this site.
 *
 * The address is resolved the way a browser resolves it, against a stand-in
 * for this site, rather than sorted by what it starts with. Sorting by prefix
 * read `//fonts.gstatic.com/x.woff2` as a path until it was taught otherwise,
 * and it still read `/\cdn.example/clip.mp4` and `\\cdn.example\clip.mp4` as
 * paths: a browser treats a backslash in an http address as a slash, so both
 * are somebody else's server, and a video block pointing at one loaded it for
 * every visitor while the privacy notice said the site loaded nothing.
 */
export function remoteHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.startsWith("#") || /^data:/i.test(url)) return null;
  try {
    const parsed = new URL(url, THIS_SITE);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.host === new URL(THIS_SITE).host ? null : parsed.host;
  } catch {
    return null;
  }
}

/**
 * What a fragment of HTML reaches for.
 *
 * Parsed, not pattern-matched. The pattern this replaces wanted a quote
 * around the value, so `<img src=https://unquoted.example/p.gif>` — which the
 * sanitiser normalises and the browser loads — was invisible to the audit,
 * and `srcset` was never scanned at all despite the comment saying it was.
 * `htmlparser2` is already a dependency, through `sanitize-html`.
 *
 * `loads` is what the browser fetches before the visitor does anything, which
 * is what the privacy notice is about. `links` is where a click would take
 * them, which is not.
 */
export interface HtmlReferences {
  loads: string[];
  links: string[];
  /** True when the fragment carries an element that embeds another document. */
  embeds: boolean;
}

/** Attributes whose value is fetched as the page loads. */
const LOADING_ATTRS = new Set(["src", "poster", "action", "data", "formaction", "background"]);

/** Tags on which `href` names something loaded rather than somewhere to go. */
const HREF_LOADS = new Set(["link", "use", "image"]);

const EMBED_TAGS = new Set(["iframe", "script", "object", "embed", "frame"]);

export function htmlReferences(html: string): HtmlReferences {
  const loads: string[] = [];
  const links: string[] = [];
  let embeds = false;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = name.toLowerCase();
        if (EMBED_TAGS.has(tag)) embeds = true;

        for (const [rawAttr, value] of Object.entries(attribs)) {
          const attr = rawAttr.toLowerCase();

          if (attr === "srcset" || attr === "imagesrcset") {
            // "a.png 1x, b.png 2x" — the URL is the first token of each part.
            for (const candidate of value.split(",")) {
              const url = candidate.trim().split(/\s+/)[0];
              if (url) loads.push(url);
            }
            continue;
          }

          if (attr === "style") {
            for (const match of value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) loads.push(match[1]);
            continue;
          }

          if (attr === "href") {
            (HREF_LOADS.has(tag) ? loads : links).push(value);
            continue;
          }
          if (attr === "xlink:href") {
            loads.push(value);
            continue;
          }

          if (LOADING_ATTRS.has(attr)) loads.push(value);
        }
      },
    },
    { lowerCaseAttributeNames: false },
  );
  parser.write(html);
  parser.end();

  return { loads, links, embeds };
}

/** Just the outside hosts a fragment loads from. */
function hostsInHtml(html: string): string[] {
  return htmlReferences(html)
    .loads.map(remoteHost)
    .filter((h): h is string => !!h);
}

/** Just the outside hosts a fragment links to. */
function linkHostsInHtml(html: string): string[] {
  return htmlReferences(html)
    .links.map(remoteHost)
    .filter((h): h is string => !!h);
}

function embedsInHtml(html: string): boolean {
  return htmlReferences(html).embeds;
}

/**
 * How deep this walk will go.
 *
 * It used to be unbounded, and about 8000 levels of nesting overflowed the
 * stack here — a 500 on the legal panel with no error boundary to click past.
 * Write paths cap trees at 32 now; this is the same number, so a row written
 * before that existed is walked as far as it is rendered and no further.
 */
const MAX_AUDIT_DEPTH = 32;

/**
 * Every rich-text prop, which is where the audit used to be blind.
 *
 * Text, heading, list, quote, button and form-label props all render through
 * the HTML sanitiser, which permits `img`, `video`, `source`, `iframe` and a
 * `style` attribute — so a tracker `<img>` inside a Text block loaded on every
 * page view and never reached the audit. On an otherwise self-contained site
 * the generated notice then stated that nothing is loaded from third parties
 * and that no § 25 TDDDG consent is needed. Where the rich text lives is
 * described once, in `rich-text-props.ts`, which the page-rename sweep reads
 * as well.
 *
 * The rendered form is what gets scanned, not the stored source: what matters
 * is what the browser is handed.
 */
function richTextIn(props: Record<string, unknown>, type = ""): string[] {
  return richTextValues(type, props)
    .filter((value) => value.includes("<"))
    .map((value) => sanitizeInlineHtml(value));
}

/** The records in a list prop, skipping anything that is not one. */
function recordsIn(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v))
    : [];
}

function walk(blocks: BaseBlock[], where: string, out: Finding[], depth = 0): void {
  if (depth > MAX_AUDIT_DEPTH) return;

  for (const block of blocks) {
    const props = (block.props ?? {}) as Record<string, unknown>;

    // A remote resource written into a rich-text prop loads for every visitor
    // exactly like one in a Custom HTML block.
    for (const fragment of richTextIn(props, block.type)) {
      for (const host of new Set(hostsInHtml(fragment))) {
        out.push({ kind: "remote-asset", host, where, detail: `Text in a ${block.type} block`, needsConsent: true });
      }
      for (const host of new Set(linkHostsInHtml(fragment))) {
        out.push({ kind: "outbound-link", host, where, detail: `Link in a ${block.type} block`, needsConsent: false });
      }
    }

    if (block.type === "form") {
      out.push({
        kind: "form",
        where,
        detail: "Form block",
        needsConsent: false,
      });
    }

    // A YouTube or Vimeo link is drawn as a frame from the privacy-preserving
    // player, not from the address that was pasted — so the host named is
    // the one the visitor's browser actually contacts. This branch used to
    // read the pasted link, which was right while the block could only hand
    // it to a `<video>` element; read that way now, it would name
    // `www.youtube.com` in the privacy notice for a page that only ever talks
    // to `www.youtube-nocookie.com`. A frame is an embed like one in a Custom
    // HTML block, and its poster is never drawn, so the poster is not a
    // request anybody makes. A block with no address, or with a YouTube or
    // Vimeo address that has no video in it, is not drawn at all — poster
    // included — so it is not one either.
    if (block.type === "video") {
      const embed = videoEmbed(props.src);
      const embedHost = embed ? remoteHost(embed.embedUrl) : null;
      if (embed && embedHost) {
        out.push({
          kind: "embed",
          host: embedHost,
          where,
          detail: `Video block showing a ${VIDEO_PROVIDER_NAME[embed.provider]} player (${embed.embedUrl})`,
          needsConsent: true,
        });
      } else if (props.src && !videoSiteOf(props.src)) {
        const host = remoteHost(props.src);
        if (host) {
          out.push({ kind: "remote-video", host, where, detail: String(props.src), needsConsent: true });
        }
        const poster = remoteHost(props.poster);
        if (poster) {
          out.push({ kind: "remote-asset", host: poster, where, detail: String(props.poster), needsConsent: true });
        }
      }
    }

    if (block.type === "image") {
      const host = remoteHost(props.src);
      if (host) {
        out.push({ kind: "remote-asset", host, where, detail: String(props.src), needsConsent: true });
      }
    }

    // A section or a column can carry a picture behind it, which is a request
    // to somebody else's server exactly like an image block is.
    for (const key of ["backgroundImage"]) {
      const host = remoteHost(props[key]);
      if (host) out.push({ kind: "remote-asset", host, where, detail: String(props[key]), needsConsent: true });
    }
    const columnStyles = props.columnStyles;
    if (Array.isArray(columnStyles)) {
      for (const style of columnStyles) {
        const host = remoteHost((style as Record<string, unknown>)?.backgroundImage);
        if (host) {
          out.push({
            kind: "remote-asset",
            host,
            where,
            detail: String((style as Record<string, unknown>).backgroundImage),
            needsConsent: true,
          });
        }
      }
    }

    if (block.type === "button") {
      const host = remoteHost(props.href);
      if (host) out.push({ kind: "outbound-link", host, where, detail: String(props.href), needsConsent: false });
    }

    // Every picture in a gallery or a slider is a request of its own, exactly
    // as an image block's is.
    if (block.type === "gallery" || block.type === "slider") {
      for (const item of recordsIn(block.type === "gallery" ? props.images : props.slides)) {
        const host = remoteHost(item.src);
        if (host) out.push({ kind: "remote-asset", host, where, detail: String(item.src), needsConsent: true });
      }
    }

    if (block.type === "audio") {
      const host = remoteHost(props.src);
      if (host) out.push({ kind: "remote-asset", host, where, detail: String(props.src), needsConsent: true });
    }

    // An embedded map is a frame from openstreetmap.org that every visitor's
    // browser loads as the page opens, and the frame then draws the map from
    // OpenStreetMap's tile server — a second host that is handed the
    // visitor's IP address just the same, and one the notice has to name
    // too. A map drawn as a card makes no request at all. Both modes carry a
    // link to OpenStreetMap and, unless the author turned it off, one to
    // Google Maps; a link transmits nothing until somebody follows it.
    if (block.type === "map") {
      if (props.mode === "embed") {
        out.push({
          kind: "embed",
          host: "www.openstreetmap.org",
          where,
          detail: "Map block showing an OpenStreetMap frame",
          needsConsent: true,
        });
        const frame = osmEmbedUrl(Number(props.lat) || 0, Number(props.lng) || 0, Number(props.zoom) || 16);
        for (const host of osmTileHosts(frame)) {
          out.push({ kind: "remote-asset", host, where, detail: "Map tiles drawn inside the OpenStreetMap frame", needsConsent: true });
        }
      }
      out.push({ kind: "outbound-link", host: "www.openstreetmap.org", where, detail: "Map block linking to OpenStreetMap", needsConsent: false });
      if (props.googleLink !== false) {
        out.push({ kind: "outbound-link", host: "www.google.com", where, detail: "Map block linking to Google Maps", needsConsent: false });
      }
    }

    if (block.type === "social") {
      for (const link of recordsIn(props.links)) {
        const host = remoteHost(link.href);
        if (host) out.push({ kind: "outbound-link", host, where, detail: String(link.href), needsConsent: false });
      }
    }

    if (block.type === "pricing") {
      for (const plan of recordsIn(props.plans)) {
        const host = remoteHost(plan.buttonHref);
        if (host) out.push({ kind: "outbound-link", host, where, detail: String(plan.buttonHref), needsConsent: false });
      }
    }

    if (block.type === "html" && typeof props.html === "string") {
      // The sanitised form, because that is what a visitor's browser gets.
      const html = sanitizeHtml(props.html);
      const hosts = hostsInHtml(html);
      if (embedsInHtml(html)) {
        out.push({
          kind: "embed",
          host: hosts[0],
          where,
          detail: hosts.length ? `Embeds content from ${[...new Set(hosts)].join(", ")}` : "Custom HTML with an embedded element",
          needsConsent: true,
        });
      }
      for (const host of new Set(hosts)) {
        if (!embedsInHtml(html)) {
          out.push({ kind: "remote-asset", host, where, detail: "Custom HTML", needsConsent: true });
        }
      }
      for (const host of new Set(linkHostsInHtml(html))) {
        out.push({ kind: "outbound-link", host, where, detail: "Link in custom HTML", needsConsent: false });
      }
      // An OpenStreetMap frame pasted from its share dialog draws its map
      // from a tile server the frame's own address never names; the map
      // block reports it, and so does the same frame pasted here.
      for (const host of new Set(htmlReferences(html).loads.flatMap(osmTileHosts))) {
        out.push({ kind: "remote-asset", host, where, detail: "Map tiles drawn inside an OpenStreetMap frame", needsConsent: true });
      }
    }

    if (block.children) walk(block.children, where, out, depth + 1);
  }
}

export interface AuditInput {
  pages: { title: string; content: string }[];
  headerHtml?: string | null;
  footerHtml?: string | null;
  favicon?: string | null;
  ogImage?: string | null;
}

/** Everything on this site that touches a visitor's data or leaves their browser. */
export function auditSite(input: AuditInput): SiteAudit {
  const findings: Finding[] = [];

  for (const page of input.pages) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(page.content || "[]");
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) walk(parsed as BaseBlock[], page.title, findings);
  }

  for (const [label, html] of [
    ["Site header", input.headerHtml],
    ["Site footer", input.footerHtml],
  ] as const) {
    if (!html) continue;
    // Sanitised, because that is what `SiteChrome` renders. Header and footer
    // markup is sanitised at the door now, but a row written before that was
    // is still in people's databases.
    const clean = sanitizeHtml(html);
    const hosts = new Set(hostsInHtml(clean));
    if (embedsInHtml(clean)) {
      findings.push({
        kind: "embed",
        host: [...hosts][0],
        where: label,
        detail: hosts.size ? `Embeds content from ${[...hosts].join(", ")}` : "An embedded element",
        needsConsent: true,
      });
    }
    for (const host of hosts) {
      findings.push({ kind: "chrome-remote", host, where: label, detail: host, needsConsent: true });
    }
    // The tile servers behind an OpenStreetMap frame, as for a Custom HTML block.
    for (const host of new Set(htmlReferences(clean).loads.flatMap(osmTileHosts))) {
      findings.push({ kind: "chrome-remote", host, where: label, detail: "Map tiles drawn inside an OpenStreetMap frame", needsConsent: true });
    }
    for (const host of new Set(linkHostsInHtml(clean))) {
      findings.push({ kind: "outbound-link", host, where: label, detail: host, needsConsent: false });
    }
  }

  for (const [label, value] of [
    ["Favicon", input.favicon],
    ["Social image", input.ogImage],
  ] as const) {
    const host = remoteHost(value);
    if (host) findings.push({ kind: "remote-asset", host, where: label, detail: String(value), needsConsent: true });
  }

  // A link is followed on a click, not on page load, so it is listed for the
  // operator and never counted as a host the site reaches.
  const remoteHosts = [
    ...new Set(
      findings
        .filter((f) => f.kind !== "outbound-link")
        .map((f) => f.host)
        .filter((h): h is string => !!h),
    ),
  ].sort();
  const linkHosts = [
    ...new Set(
      findings
        .filter((f) => f.kind === "outbound-link")
        .map((f) => f.host)
        .filter((h): h is string => !!h),
    ),
  ].sort();

  return {
    findings,
    hasForm: findings.some((f) => f.kind === "form"),
    remoteHosts,
    linkHosts,
    selfContained: remoteHosts.length === 0,
  };
}
