"use client";
import Link from "next/link";
import { sanitizeHtml } from "@/lib/sanitize";
import { isDarkColor } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { safeAccent } from "@/lib/site-fields";
import { normalizeLogo } from "@/lib/site-logo";
import { resolveMenu, type MenuItem } from "@/lib/menu";
import { footerCopyright, footerLinkHref, mailHref, normalizeFooter, telHref } from "@/lib/footer";
import { readableTextFor } from "@/lib/site-theme";
import { SocialLinks } from "@/components/blocks/SocialLinks";

/**
 * The header and footer a visitor sees.
 *
 * These used to live inside the published page, so the editor canvas showed
 * neither: you laid out a page against a blank top edge and only found out
 * what it sat under after publishing. The editor renders the same components
 * now, from the same settings.
 */

export interface SiteChrome {
  name: string;
  slug: string;
  accent: string;
  headerHtml: string | null;
  footerHtml: string | null;
  headerBackground: string;
  headerOpacity: number;
  headerShape: string;
  headerPosition: string;
  /** The header's picture, as stored: see `normalizeLogo`. */
  logo?: string | null;
  /** The menu's arrangement, as stored: see `normalizeMenu`. */
  menu?: string | null;
  /** The laid-out footer, as stored: see `normalizeFooter`. */
  footer?: string | null;
}

export interface NavPage {
  /** The menu names pages by id, which a rename leaves alone. */
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
}

/**
 * A page § 5 DDG requires to be reachable from wherever a visitor happens to
 * be — the Impressum, and the Datenschutzerklärung that Art. 13 DSGVO asks
 * for. "Ständig verfügbar" is the wording, and a footer on every page is how
 * a website answers it, so these are not part of the nav the operator curates:
 * they are placed, not offered.
 */
export interface LegalPage {
  slug: string;
  title: string;
}

// Parses a #rgb / #rrggbb hex color into an rgba() string at the given
// opacity. Falls back to opaque white for anything that isn't valid hex, so
// an unvalidated stored value can never smuggle something else into the
// inline style.
function hexToRgba(hex: string, opacityPercent: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255, 255, 255, ${opacityPercent / 100})`;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
}


/**
 * A value on its way into markup the operator wrote.
 *
 * `{name}`, `{nav}` and `{legal}` are substituted into a custom header or
 * footer as text, and the values come from places the operator did not type:
 * a page title set over MCP or arriving in an imported archive, a site name
 * likewise. A page renamed to `<img src="https://attacker/nav">` put a beacon
 * in the nav of every page; `</a><div class="pwned">` broke out of the
 * operator's own anchor. The sanitiser runs afterwards, so nothing scripted —
 * but the markup was the author's to decide, not a page title's.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The same, for a value that goes inside an href rather than between tags. */
function escapeUrlPart(value: string): string {
  return encodeURIComponent(value);
}

/**
 * `String.replace` with a string replacement expands `$&`, `` $` `` and `$'`.
 * A site name containing `` $` `` duplicated the operator's own header markup
 * back into the page. A function replacer is inert.
 */
function substitute(html: string, token: RegExp, value: string): string {
  return html.replace(token, () => value);
}

export function SiteHeader({
  site,
  pages,
  activeSlug,
  contained,
}: {
  site: SiteChrome;
  pages: NavPage[];
  activeSlug: string;
  /**
   * True in the editor, where the canvas is a panel rather than the page. A
   * fixed header there is fixed to the *window*: it covered the builder's own
   * toolbar and spanned the whole app. Held inside the canvas it sits where a
   * visitor will see it.
   */
  contained?: boolean;
}) {
  // What the menu holds: the site's own arrangement of its pages and links,
  // with every page it does not mention yet at the end.
  const menu = resolveMenu(site.menu, pages, { slug: escapeUrlPart(site.slug) }, activeSlug);

  // Custom header overrides the default
  if (site.headerHtml) {
    // A written header has no dropdowns of its own to put a page's children
    // in, so they follow their parent in the one row of links.
    const navHtml = menu
      .flatMap((item) => [item, ...item.children])
      .filter((item) => item.href)
      .map((item) => {
        const active = item.active ? ' class="active"' : "";
        return `<a href="${escapeHtml(item.href!)}"${active}>${escapeHtml(item.label)}</a>`;
      })
      .join("");
    const html = substitute(
      substitute(site.headerHtml, /\{name\}/g, escapeHtml(site.name)),
      /\{nav\}/g,
      navHtml,
    );
    return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
  }

  const dark = isDarkColor(site.headerBackground);
  /**
   * Where a sticky header comes to rest.
   *
   * A pill floats on a 1rem margin, and `top-0` threw that margin away the
   * moment the page scrolled: the pill snapped flush against the top of the
   * window, its rounded top edge went straight across, and a shape chosen to
   * float read as a plain bar. Holding it at the same 1rem it sits at when
   * the page is at rest keeps it the shape it is meant to be at every scroll
   * position. A bar and a rounded header are both drawn to sit flush, so they
   * stay at 0.
   */
  const stickyOffset = site.headerShape === "pill" ? "top-4" : "top-0";
  /**
   * In the canvas a fixed header is drawn sticky.
   *
   * It used to be `absolute`, which pinned it to the top of the page rather
   * than to the top of the view: scroll the canvas and it slid away, so the
   * editor showed a header behaving in a way no visitor will ever see. The
   * canvas is a framed viewport that scrolls on its own, and sticky is what
   * holds a header still inside one. It sits in the flow, which is exactly
   * the room the published page reserves for a fixed header with its own
   * padding — so the two come out in the same place.
   */
  const fixedHere = site.headerPosition === "fixed" && !contained;
  const positionClass = fixedHere
    ? "fixed top-0 left-0 right-0"
    : site.headerPosition === "fixed" || site.headerPosition === "sticky"
      ? `sticky ${stickyOffset}`
      : "";
  const shapeClass =
    site.headerShape === "pill" ? "mx-4 mt-4 rounded-full shadow-lg" :
    site.headerShape === "rounded" ? "rounded-b-2xl shadow-sm" :
    "border-b border-slate-200/70";
  const navActiveClass = dark ? "text-white bg-white/15" : "text-slate-900 bg-slate-100";
  const navInactiveClass = dark ? "text-slate-300 hover:text-white hover:bg-white/10" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100";
  const logo = normalizeLogo(site.logo);
  const solid = hexToRgba(site.headerBackground, 100);

  /** One entry of the menu: a link, or a heading that only opens its dropdown. */
  const entry = (item: MenuItem, className: string, suffix?: string) =>
    item.href ? (
      <Link href={item.href} className={className} aria-current={item.active && !item.children.length ? "page" : undefined}>
        {item.label}
        {suffix}
      </Link>
    ) : (
      // A button so it can be reached from the keyboard, which is what opens
      // its dropdown: there is no script on a published page to do more.
      <button type="button" aria-haspopup="true" className={className}>
        {item.label}
        {suffix}
      </button>
    );

  return (
    <header
      className={cn("z-20 backdrop-blur", positionClass, shapeClass, dark ? "text-white" : "text-slate-900")}
      style={{ background: hexToRgba(site.headerBackground, site.headerOpacity) }}
    >
      <div className="nvx-site-column h-16 flex items-center gap-6">
        <Link href={`/sites/${site.slug}`} className="flex items-center gap-2 font-semibold tracking-tight">
          {logo ? (
            // The name is the picture's text when the picture stands alone,
            // and nothing when the name is written beside it — said twice,
            // a screen reader reads it twice.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.src} alt={logo.withName ? "" : site.name} className="nvx-logo block w-auto" style={{ height: logo.height }} />
          ) : (
            <span className="w-5 h-5 rounded" style={{ background: safeAccent(site.accent) }} />
          )}
          {!logo || logo.withName ? site.name : null}
        </Link>
        {/* Desktop: inline nav. Small screens: the same links behind a menu,
            so a site with more than a couple of pages stops overflowing. */}
        <nav data-nav="desktop" className="ml-auto hidden sm:flex items-center gap-1 text-sm">
          {menu.map((item, i) =>
            item.children.length === 0 ? (
              <span key={i} className="contents">
                {entry(item, `px-3 py-1.5 rounded-md ${item.active ? navActiveClass : navInactiveClass}`)}
              </span>
            ) : (
              // Opened by hovering and by the keyboard reaching it, in CSS
              // alone (see .nvx-menu-group), so it works in the download.
              <div key={i} className="nvx-menu-group relative">
                {entry(item, `px-3 py-1.5 rounded-md inline-flex items-center gap-1 ${item.active ? navActiveClass : navInactiveClass}`, " ▾")}
                <div className="nvx-menu-drop absolute left-0 top-full pt-2 min-w-[12rem]">
                  <div
                    className={`rounded-xl border p-1.5 shadow-xl flex flex-col gap-0.5 ${dark ? "border-white/15" : "border-slate-200"}`}
                    style={{ background: solid }}
                  >
                    {item.children.map((child, j) => (
                      <span key={j} className="contents">
                        {entry(child, `px-3 py-2 rounded-md text-left ${child.active ? navActiveClass : navInactiveClass}`)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ),
          )}
        </nav>

        <details className="nvx-nav-toggle ml-auto sm:hidden relative">
          <summary
            aria-label="Menu"
            className={`w-9 h-9 rounded-md flex items-center justify-center text-lg ${dark ? "text-white hover:bg-white/10" : "text-slate-900 hover:bg-slate-100"}`}
          >
            <span className="nvx-nav-open-icon leading-none">☰</span>
            <span className="nvx-nav-close-icon leading-none">✕</span>
          </summary>
          <nav
            data-nav="mobile"
            className={`absolute right-0 top-11 min-w-[11rem] rounded-xl border p-1.5 shadow-xl flex flex-col gap-0.5 text-sm ${dark ? "border-white/15" : "border-slate-200"}`}
            style={{ background: solid }}
          >
            {/* A dropdown's items are listed under it here, indented: a menu
                inside a menu is one tap too many on a phone. */}
            {menu.map((item, i) => (
              <span key={i} className="contents">
                {entry(item, `px-3 py-2 rounded-md text-left ${item.active ? navActiveClass : navInactiveClass}`)}
                {item.children.map((child, j) => (
                  <span key={j} className="contents">
                    {entry(child, `pl-6 pr-3 py-2 rounded-md text-left ${child.active ? navActiveClass : navInactiveClass}`)}
                  </span>
                ))}
              </span>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

/** The legal links as anchors, for a custom footer written as HTML. */
function legalHtml(site: { slug: string }, legal: LegalPage[]): string {
  return legal
    .map((p) => {
      const href = `/sites/${escapeUrlPart(site.slug)}/${escapeUrlPart(p.slug)}`;
      return `<a href="${escapeHtml(href)}">${escapeHtml(p.title)}</a>`;
    })
    .join(" · ");
}

/**
 * True once a custom footer already links to every legal page itself, in
 * which case it is left alone — somebody who placed the links by hand does
 * not want a second row of them underneath.
 */
function customFooterCoversLegal(html: string, site: { slug: string }, legal: LegalPage[]): boolean {
  return legal.every((p) => html.includes(`/sites/${escapeUrlPart(site.slug)}/${escapeUrlPart(p.slug)}`));
}

export function SiteFooter({
  site,
  legal = [],
}: {
  site: { name: string; slug: string; footerHtml: string | null; footer?: string | null };
  legal?: LegalPage[];
}) {
  const links = legal.map((p) => ({ ...p, href: `/sites/${site.slug}/${p.slug}` }));
  const design = site.footerHtml ? null : normalizeFooter(site.footer);
  if (design) return <DesignedFooter site={site} design={design} links={links} />;

  if (site.footerHtml) {
    let html = substitute(site.footerHtml, /\{name\}/g, escapeHtml(site.name));
    html = substitute(html, /\{year\}/g, String(new Date().getFullYear()));
    html = substitute(html, /\{legal\}/g, legalHtml(site, legal));
    const covered = links.length === 0 || customFooterCoversLegal(html, site, legal);
    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
        {/*
          A custom footer that never mentions them would drop the Impressum
          off every page at once, which is the one thing this must not let
          happen. `{legal}` puts the links where the author wants them; without
          it they are added below rather than quietly lost.
        */}
        {covered ? null : (
          <div className="border-t border-slate-200">
            <div className="nvx-site-column py-4 text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
              {links.map((l) => (
                <Link key={l.slug} href={l.href} className="hover:text-slate-900 underline underline-offset-2">
                  {l.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <footer className="border-t border-slate-200 mt-16">
      <div className="nvx-site-column py-10 text-sm text-slate-500 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span>© {new Date().getFullYear()} {site.name}</span>
        {links.length > 0 ? (
          <span className="flex flex-wrap gap-x-4 gap-y-1 order-last sm:order-none w-full sm:w-auto">
            {links.map((l) => (
              <Link key={l.slug} href={l.href} className="hover:text-slate-900 underline underline-offset-2">
                {l.title}
              </Link>
            ))}
          </span>
        ) : null}
        <span>Built with Neuravex</span>
      </div>
    </footer>
  );
}

/**
 * The footer laid out from settings: the site's name with a line about it,
 * its contact details and profiles, up to four columns of links, and a bottom
 * row with the copyright line and the legal links. See `lib/footer.ts`.
 *
 * The columns sit in a grid that gives the first, wider cell to the site and
 * folds to one column on a phone. A background colour brings the text colour
 * that reads on it, as a section's does; links take the same colour, faded,
 * rather than the builder's slate, which on a dark footer was unreadable.
 */
function DesignedFooter({
  site,
  design,
  links,
}: {
  site: { name: string };
  design: NonNullable<ReturnType<typeof normalizeFooter>>;
  links: { slug: string; title: string; href: string }[];
}) {
  const text = design.background ? readableTextFor(design.background) : null;
  const tel = design.contact.phone ? telHref(design.contact.phone) : null;
  const mail = design.contact.email ? mailHref(design.contact.email) : null;
  const muted = text ? "opacity-75 hover:opacity-100" : "text-slate-500 hover:text-slate-900";

  return (
    <footer
      className={cn("nvx-footer mt-16", design.background ? "" : "border-t border-slate-200")}
      style={design.background ? { background: design.background, color: text ?? undefined } : undefined}
    >
      <div
        className="nvx-site-column py-12 grid gap-10 text-sm"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 11rem), 1fr))` }}
      >
        <div className="space-y-3 min-w-0">
          <div className="text-base font-semibold">{site.name}</div>
          {design.about ? <p className={cn("whitespace-pre-line", text ? "opacity-80" : "text-slate-600")}>{design.about}</p> : null}
          {design.contact.address || tel || mail ? (
            <address className={cn("not-italic space-y-1", text ? "opacity-80" : "text-slate-600")}>
              {design.contact.address ? <p className="whitespace-pre-line">{design.contact.address}</p> : null}
              {tel ? (
                <p>
                  <a href={tel} className="underline underline-offset-2">{design.contact.phone}</a>
                </p>
              ) : null}
              {mail ? (
                <p>
                  <a href={mail} className="underline underline-offset-2">{design.contact.email}</a>
                </p>
              ) : null}
            </address>
          ) : null}
          {design.social.length > 0 ? (
            <SocialLinks disabled props={{ links: design.social, size: "sm", shape: "circle", color: "", align: "left" }} />
          ) : null}
        </div>
        {design.columns.map((column, i) => (
          <nav key={i} aria-label={column.title || `Links ${i + 1}`} className="min-w-0">
            {column.title ? <h2 className="text-sm font-semibold mb-3">{column.title}</h2> : null}
            <ul className="space-y-2">
              {column.links.map((l, j) => (
                <li key={j}>
                  <a href={footerLinkHref(l.href)} className={muted}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div
        className={cn("border-t", text ? "" : "border-slate-200")}
        style={text ? { borderColor: "color-mix(in srgb, currentColor 15%, transparent)" } : undefined}
      >
        <div className={cn("nvx-site-column py-5 text-sm flex flex-wrap items-center justify-between gap-x-6 gap-y-2", text ? "opacity-80" : "text-slate-500")}>
          <span>{footerCopyright(design, site)}</span>
          {links.length > 0 ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {links.map((l) => (
                <Link key={l.slug} href={l.href} className="underline underline-offset-2">
                  {l.title}
                </Link>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
