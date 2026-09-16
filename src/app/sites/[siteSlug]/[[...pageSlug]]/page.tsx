import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BaseBlock } from "@/types";
import { PublicBlocks } from "@/components/public/PublicBlocks";
import Link from "next/link";
import type { Metadata } from "next";
import { sanitizeHtml } from "@/lib/sanitize";
import { sanitizeCss, sanitizeCssValue } from "@/lib/security";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: { siteSlug: string; pageSlug?: string[] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await prisma.site.findUnique({ where: { slug: params.siteSlug } });
  if (!site) return {};
  const pageSlug = params.pageSlug?.join("/");
  const pages = await prisma.page.findMany({ where: { siteId: site.id, published: true } });
  const page = pageSlug ? pages.find((p) => p.slug === pageSlug) : pages.find((p) => p.isHome) ?? pages[0];
  const title = page?.metaTitle || site.metaTitle || page?.title || site.name;
  const desc = page?.metaDescription || site.metaDescription || site.description || undefined;
  const og = page?.ogImage || site.ogImage || undefined;
  return { title, description: desc, openGraph: og ? { images: [og] } : undefined };
}

export default async function PublicSitePage({ params }: Props) {
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    include: { pages: { where: { published: true }, orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }] } },
  });
  if (!site) notFound();

  const pageSlug = params.pageSlug?.join("/");
  const page = pageSlug
    ? site.pages.find((p) => p.slug === pageSlug)
    : site.pages.find((p) => p.isHome) ?? site.pages[0];
  if (!page) notFound();

  let blocks: BaseBlock[] = [];
  try {
    const parsed = JSON.parse(page.content || "[]");
    if (Array.isArray(parsed)) blocks = parsed as BaseBlock[];
  } catch {
    blocks = [];
  }

  // Theme CSS variables
  const themeVars: string[] = [];
  if (site.fontFamily) themeVars.push(`--site-font: ${sanitizeCssValue(site.fontFamily)}`);
  if (site.headingFont) themeVars.push(`--site-heading-font: ${sanitizeCssValue(site.headingFont)}`);
  if (site.borderRadius) themeVars.push(`--site-radius: ${sanitizeCssValue(site.borderRadius)}`);
  if (site.accent) themeVars.push(`--site-accent: ${sanitizeCssValue(site.accent)}`);

  return (
    <>
      {themeVars.length > 0 ? (
        <style dangerouslySetInnerHTML={{ __html: `:root { ${themeVars.join("; ")} } body { font-family: var(--site-font, inherit); } h1,h2,h3,h4,h5,h6 { font-family: var(--site-heading-font, inherit); }` }} />
      ) : null}
      {site.customCss ? <style dangerouslySetInnerHTML={{ __html: sanitizeCss(site.customCss) }} /> : null}
      <div className="public-canvas">
        <PublicSiteHeader site={site} pages={site.pages} activeSlug={page.slug} />
        <main className={!site.headerHtml && site.headerPosition === "fixed" ? "pt-28" : undefined}>
          <PublicBlocks blocks={blocks} pageId={page.id} />
        </main>
        <PublicSiteFooter site={site} />
      </div>
    </>
  );
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

// Simple relative-luminance check to decide whether header text/nav should
// render light or dark, so any background color choice stays readable.
function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function PublicSiteHeader({
  site,
  pages,
  activeSlug,
}: {
  site: {
    name: string; slug: string; accent: string;
    fontFamily: string | null; headingFont: string | null;
    headerHtml: string | null;
    headerBackground: string; headerOpacity: number;
    headerShape: string; headerPosition: string;
  };
  pages: { slug: string; title: string; isHome: boolean }[];
  activeSlug: string;
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
    site.headerPosition === "fixed" ? "fixed top-0 left-0 right-0" :
    site.headerPosition === "sticky" ? "sticky top-0" : "";
  const shapeClass =
    site.headerShape === "pill" ? "mx-4 mt-4 rounded-full shadow-lg" :
    site.headerShape === "rounded" ? "rounded-b-2xl shadow-sm" :
    "border-b border-slate-200/70";
  const navActiveClass = dark ? "text-white bg-white/15" : "text-slate-900 bg-slate-100";
  const navInactiveClass = dark ? "text-slate-300 hover:text-white hover:bg-white/10" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100";

  return (
    <header
      className={cn("z-20 backdrop-blur", positionClass, shapeClass, dark ? "text-white" : "text-slate-900")}
      style={{ background: hexToRgba(site.headerBackground, site.headerOpacity) }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
        <Link href={`/sites/${site.slug}`} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="w-5 h-5 rounded" style={{ background: site.accent }} />
          {site.name}
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {pages.map((p) => {
            const href = p.isHome ? `/sites/${site.slug}` : `/sites/${site.slug}/${p.slug}`;
            const active = p.slug === activeSlug;
            return (
              <Link key={p.slug} href={href} className={`px-3 py-1.5 rounded-md ${active ? navActiveClass : navInactiveClass}`}>
                {p.title}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function PublicSiteFooter({ site }: { site: { name: string; footerHtml: string | null } }) {
  if (site.footerHtml) {
    const html = site.footerHtml.replace(/\{name\}/g, site.name).replace(/\{year\}/g, String(new Date().getFullYear()));
    return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
  }

  return (
    <footer className="border-t border-slate-200 mt-16">
      <div className="max-w-6xl mx-auto px-6 py-10 text-sm text-slate-500 flex items-center justify-between">
        <span>© {new Date().getFullYear()} {site.name}</span>
        <span>Built with Neuravex</span>
      </div>
    </footer>
  );
}
