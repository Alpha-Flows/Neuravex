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

import { BaseBlock } from "@/types";

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
  | "chrome-remote";

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
  /** Every outside host the site reaches, deduplicated and sorted. */
  remoteHosts: string[];
  /** True when nothing on the site reaches outside the visitor's browser. */
  selfContained: boolean;
}

/** The host of an absolute URL, or null for a path on this same site. */
export function remoteHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  // A protocol-relative address is still somebody else's server, and it has to
  // be tested before the leading-slash check or `//fonts.gstatic.com/x.woff2`
  // reads as a path on this site.
  const protocolRelative = url.startsWith("//");
  if (!protocolRelative && (url.startsWith("/") || url.startsWith("#") || url.startsWith("data:"))) return null;
  const withProtocol = protocolRelative ? `https:${url}` : url;
  try {
    const parsed = new URL(withProtocol);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.host : null;
  } catch {
    return null;
  }
}

/** Absolute addresses inside a fragment of HTML, from src, href, action and srcset. */
function hostsInHtml(html: string): string[] {
  const hosts: string[] = [];
  for (const match of html.matchAll(/(?:src|href|action|data|poster)\s*=\s*["']([^"']+)["']/gi)) {
    const host = remoteHost(match[1]);
    if (host) hosts.push(host);
  }
  for (const match of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const host = remoteHost(match[1]);
    if (host) hosts.push(host);
  }
  return hosts;
}

const EMBED_TAG = /<\s*(iframe|script|object|embed)\b/i;

function walk(blocks: BaseBlock[], where: string, out: Finding[]): void {
  for (const block of blocks) {
    const props = (block.props ?? {}) as Record<string, unknown>;

    if (block.type === "form") {
      out.push({
        kind: "form",
        where,
        detail: "Form block",
        needsConsent: false,
      });
    }

    if (block.type === "video") {
      const host = remoteHost(props.src);
      if (host) {
        out.push({ kind: "remote-video", host, where, detail: String(props.src), needsConsent: true });
      }
      const poster = remoteHost(props.poster);
      if (poster) {
        out.push({ kind: "remote-asset", host: poster, where, detail: String(props.poster), needsConsent: true });
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

    if (block.type === "html" && typeof props.html === "string") {
      const html = props.html;
      const hosts = hostsInHtml(html);
      if (EMBED_TAG.test(html)) {
        out.push({
          kind: "embed",
          host: hosts[0],
          where,
          detail: hosts.length ? `Embeds content from ${[...new Set(hosts)].join(", ")}` : "Custom HTML with an embedded element",
          needsConsent: true,
        });
      }
      for (const host of new Set(hosts)) {
        if (!EMBED_TAG.test(html)) {
          out.push({ kind: "remote-asset", host, where, detail: "Custom HTML", needsConsent: true });
        }
      }
    }

    if (block.children) walk(block.children, where, out);
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
    const hosts = new Set(hostsInHtml(html));
    if (EMBED_TAG.test(html)) {
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
  }

  for (const [label, value] of [
    ["Favicon", input.favicon],
    ["Social image", input.ogImage],
  ] as const) {
    const host = remoteHost(value);
    if (host) findings.push({ kind: "remote-asset", host, where: label, detail: String(value), needsConsent: true });
  }

  const remoteHosts = [...new Set(findings.map((f) => f.host).filter((h): h is string => !!h))].sort();
  return {
    findings,
    hasForm: findings.some((f) => f.kind === "form"),
    remoteHosts,
    selfContained: remoteHosts.length === 0,
  };
}
