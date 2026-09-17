"use client";
import Link from "next/link";
import { sanitizeHtml } from "@/lib/sanitize";
import { isDarkColor } from "@/lib/site-theme";
import { cn } from "@/lib/utils";

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
}

export interface NavPage {
  slug: string;
  title: string;
  isHome: boolean;
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
  // Custom header overrides the default
  if (site.headerHtml) {
    const navHtml = pages
      .map((p) => {
        const href = p.isHome ? `/sites/${site.slug}` : `/sites/${site.slug}/${p.slug}`;
        const active = p.slug === activeSlug ? ' class="active"' : "";
        return `<a href="${href}"${active}>${p.title}</a>`;
      })
      .join("");
    const html = site.headerHtml.replace(/\{name\}/g, site.name).replace(/\{nav\}/g, navHtml);
    return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
  }

  const dark = isDarkColor(site.headerBackground);
  const positionClass =
    site.headerPosition === "fixed"
      ? contained ? "absolute top-0 left-0 right-0" : "fixed top-0 left-0 right-0"
      : site.headerPosition === "sticky" ? "sticky top-0" : "";
  const shapeClass =
    site.headerShape === "pill" ? "mx-4 mt-4 rounded-full shadow-lg" :
    site.headerShape === "rounded" ? "rounded-b-2xl shadow-sm" :
    "border-b border-slate-200/70";
  const navActiveClass = dark ? "text-white bg-white/15" : "text-slate-900 bg-slate-100";
  const navInactiveClass = dark ? "text-slate-300 hover:text-white hover:bg-white/10" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100";
  const navLinks = pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    href: p.isHome ? `/sites/${site.slug}` : `/sites/${site.slug}/${p.slug}`,
    active: p.slug === activeSlug,
  }));

  return (
    <header
      className={cn("z-20 backdrop-blur", positionClass, shapeClass, dark ? "text-white" : "text-slate-900")}
      style={{ background: hexToRgba(site.headerBackground, site.headerOpacity) }}
    >
      <div className="nvx-site-column h-16 flex items-center gap-6">
        <Link href={`/sites/${site.slug}`} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="w-5 h-5 rounded" style={{ background: site.accent }} />
          {site.name}
        </Link>
        {/* Desktop: inline nav. Small screens: the same links behind a menu,
            so a site with more than a couple of pages stops overflowing. */}
        <nav data-nav="desktop" className="ml-auto hidden sm:flex items-center gap-1 text-sm">
          {navLinks.map((l) => (
            <Link key={l.slug} href={l.href} className={`px-3 py-1.5 rounded-md ${l.active ? navActiveClass : navInactiveClass}`}>
              {l.title}
            </Link>
          ))}
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
            style={{ background: hexToRgba(site.headerBackground, 100) }}
          >
            {navLinks.map((l) => (
              <Link key={l.slug} href={l.href} className={`px-3 py-2 rounded-md ${l.active ? navActiveClass : navInactiveClass}`}>
                {l.title}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ site }: { site: { name: string; footerHtml: string | null } }) {
  if (site.footerHtml) {
    const html = site.footerHtml.replace(/\{name\}/g, site.name).replace(/\{year\}/g, String(new Date().getFullYear()));
    return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
  }

  return (
    <footer className="border-t border-slate-200 mt-16">
      <div className="nvx-site-column py-10 text-sm text-slate-500 flex items-center justify-between">
        <span>© {new Date().getFullYear()} {site.name}</span>
        <span>Built with Neuravex</span>
      </div>
    </footer>
  );
}
