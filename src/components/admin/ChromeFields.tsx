"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { MediaPicker } from "@/components/editor/MediaPicker";
import { ColorInput, LinkField, ListEditor, Toggle } from "@/components/editor/inspector-fields";
import { SocialLinksEditor } from "@/components/editor/inspectors/SocialPanel";
import type { LinkTarget } from "@/lib/page-links";
import { LOGO_HEIGHT, type SiteLogo } from "@/lib/site-logo";
import { MAX_MENU_ENTRIES, MAX_MENU_LABEL, type MenuEntry } from "@/lib/menu";
import { DEFAULT_COPYRIGHT, FOOTER_LIMITS, emptyFooter, type FooterColumn, type FooterDesign, type FooterLink } from "@/lib/footer";

/** A page of the site as the menu and footer editors need it. */
export interface ChromePage {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  published: boolean;
  legalKind?: string | null;
  /** The site's "not found" page, which the menu leaves out. */
  isNotFound?: boolean;
  /** A blog post, which the menu leaves out too. */
  isPost?: boolean;
  /** Empty for the site's language; a page in another is in that language's menu. */
  language?: string | null;
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

/**
 * The header's picture: chosen from the library, sized, and with or without
 * the site's name beside it.
 */
export function LogoField({ logo, onChange }: { logo: SiteLogo | null; onChange: (next: SiteLogo | null) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="space-y-2">
      <Label>Logo</Label>
      {logo ? (
        <div className="space-y-2">
          {/* On a checkerboard, so a logo with a transparent background shows
              its edges rather than vanishing into the panel. */}
          <div
            className="rounded-md border border-bg-border p-3"
            style={{
              backgroundColor: "#ffffff",
              backgroundImage: "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 8px 8px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt="The site's logo" style={{ height: logo.height }} className="w-auto" />
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="w-14 shrink-0">Height</span>
            <input
              type="range"
              aria-label="Logo height"
              min={LOGO_HEIGHT.min}
              max={LOGO_HEIGHT.max}
              value={logo.height}
              onChange={(e) => onChange({ ...logo, height: Number(e.target.value) })}
              className="flex-1 accent-brand"
            />
            <span className="w-10 text-right">{logo.height}px</span>
          </label>
          <Toggle
            label="Write the site's name beside it"
            checked={logo.withName}
            onChange={(withName) => onChange({ ...logo, withName })}
            hint="Leave it off when the logo already spells the name."
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicking(true)}>Change</Button>
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPicking(true)}>Choose a logo</Button>
      )}
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onSelect={(src) => {
          onChange({ src, height: logo?.height ?? LOGO_HEIGHT.default, withName: logo?.withName ?? false });
          setPicking(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/**
 * The header's menu, arranged by hand: the order of its entries, a shorter
 * label for any page, a page left out, links of the author's own, and one
 * level of entries under any entry, drawn as a dropdown.
 *
 * Every page of the site is always in the list, left out or not, so nothing
 * is lost by arranging it: a page cannot be removed from the menu, only left
 * out of it, and a page made later is added at the end. Only a link can be
 * removed, since only a link was added here.
 */
export function MenuEditor({
  menu,
  onChange,
  pages,
  siteSlug,
}: {
  menu: MenuEntry[];
  onChange: (next: MenuEntry[]) => void;
  pages: ChromePage[];
  siteSlug: string;
}) {
  const count = menu.reduce((n, e) => n + 1 + (e.children?.length ?? 0), 0);
  const targets: LinkTarget[] = pages;
  const nameOf = (e: MenuEntry) => {
    const page = e.kind === "page" ? pages.find((p) => p.id === e.page) : undefined;
    return e.label || page?.title || "Untitled link";
  };

  const move = (list: MenuEntry[], from: number, to: number) => {
    if (to < 0 || to >= list.length) return list;
    const next = list.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    return next;
  };

  const updateAt = (i: number, next: MenuEntry) => onChange(menu.map((e, k) => (k === i ? next : e)));

  /** Takes a top-level entry and files it under another. */
  const fileUnder = (i: number, parent: number) => {
    const entry = menu[i];
    const target = menu[parent];
    const next = menu.map((e, k) => (k === parent ? { ...target, children: [...(target.children ?? []), entry] } : e));
    onChange(next.filter((_, k) => k !== i));
  };

  /** Takes an entry out of a dropdown and puts it just after its parent. */
  const takeOut = (i: number, j: number) => {
    const parent = menu[i];
    const child = parent.children![j];
    const next = menu.slice();
    next[i] = { ...parent, children: parent.children!.filter((_, k) => k !== j) };
    next.splice(i + 1, 0, child);
    onChange(next);
  };

  const row = (
    e: MenuEntry,
    update: (next: MenuEntry) => void,
    controls: React.ReactNode,
    depth: 0 | 1,
  ) => {
    const page = e.kind === "page" ? pages.find((p) => p.id === e.page) : undefined;
    const name = nameOf(e);
    return (
      <div className={`rounded-md border border-bg-border bg-bg p-2 space-y-2 ${depth ? "ml-5" : ""} ${e.hidden ? "opacity-70" : ""}`}>
        <div className="flex items-center gap-1">
          <span className="flex-1 min-w-0 truncate text-xs font-medium text-fg-muted">
            {e.kind === "page" ? `Page · ${page?.title ?? "missing"}` : "Link"}
            {page && !page.published ? " — draft, shown once published" : ""}
            {e.hidden ? " — left out" : ""}
          </span>
          {controls}
        </div>
        <Input
          aria-label={`Label for ${name}`}
          value={e.label ?? ""}
          maxLength={MAX_MENU_LABEL}
          placeholder={page?.title ?? "What the link says"}
          onChange={(ev) => update({ ...e, label: ev.target.value })}
          className="h-8 text-sm"
        />
        {e.kind === "link" ? (
          <>
            <LinkField value={e.href ?? ""} onChange={(href) => update({ ...e, href })} pages={targets} siteSlug={siteSlug} ariaLabel={`Address for ${name}`} />
            {depth === 0 ? (
              <p className="text-[11px] text-fg-subtle">Leave the address empty for a heading that only opens its dropdown.</p>
            ) : null}
          </>
        ) : (
          <Toggle label={`Leave ${page?.title ?? "this page"} out of the menu`} checked={!!e.hidden} onChange={(hidden) => update({ ...e, hidden: hidden || undefined })} />
        )}
      </div>
    );
  };

  const small = "w-6 h-6 rounded text-xs text-fg-subtle hover:text-fg hover:bg-bg-card disabled:opacity-30";

  return (
    <div className="space-y-2">
      {menu.map((e, i) => {
        const name = nameOf(e);
        const others = menu.map((o, k) => ({ o, k })).filter(({ k }) => k !== i);
        return (
          <div key={i} className="space-y-1.5">
            {row(
              e,
              (next) => updateAt(i, next),
              <>
                <button onClick={() => onChange(move(menu, i, i - 1))} disabled={i === 0} aria-label={`Move ${name} up`} className={small}>↑</button>
                <button onClick={() => onChange(move(menu, i, i + 1))} disabled={i === menu.length - 1} aria-label={`Move ${name} down`} className={small}>↓</button>
                {e.kind === "link" ? (
                  <button onClick={() => onChange(menu.filter((_, k) => k !== i))} aria-label={`Remove ${name}`} className={small}>✕</button>
                ) : null}
              </>,
              0,
            )}
            {!e.children?.length && others.length > 0 ? (
              <select
                value=""
                aria-label={`Put ${name} in a dropdown`}
                onChange={(ev) => ev.target.value !== "" && fileUnder(i, Number(ev.target.value))}
                className="h-7 w-full px-2 rounded-md bg-bg border border-bg-border text-fg-muted text-xs"
              >
                <option value="">Put in a dropdown under…</option>
                {others.map(({ o, k }) => (
                  <option key={k} value={k}>{nameOf(o)}</option>
                ))}
              </select>
            ) : null}
            {(e.children ?? []).map((child, j) => {
              const childName = nameOf(child);
              return (
                <div key={j}>
                  {row(
                    child,
                    (next) => updateAt(i, { ...e, children: e.children!.map((c, k) => (k === j ? next : c)) }),
                    <>
                      <button onClick={() => updateAt(i, { ...e, children: move(e.children!, j, j - 1) })} disabled={j === 0} aria-label={`Move ${childName} up`} className={small}>↑</button>
                      <button onClick={() => updateAt(i, { ...e, children: move(e.children!, j, j + 1) })} disabled={j === e.children!.length - 1} aria-label={`Move ${childName} down`} className={small}>↓</button>
                      <button onClick={() => takeOut(i, j)} aria-label={`Take ${childName} out of the dropdown`} title="Out of the dropdown" className={small}>⇤</button>
                    </>,
                    1,
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        disabled={count >= MAX_MENU_ENTRIES}
        onClick={() => onChange([...menu, { kind: "link", label: "", href: "" }])}
      >
        Add a link
      </Button>
      <p className="text-xs text-fg-subtle">
        A link needs a label and an address — another site, a page here, or a named section — or entries in its
        dropdown. One that has neither is left out when you save.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

/**
 * The footer, laid out: a line about the site, contact details, profiles,
 * columns of links, a copyright line and a background.
 *
 * Off, the footer is the one line of small print it always was. Turning it on
 * starts from the copyright line alone, so there is something to save; taking
 * everything out again turns it back off.
 */
export function FooterEditor({
  design,
  onChange,
  pages,
  siteSlug,
}: {
  design: FooterDesign | null;
  onChange: (next: FooterDesign | null) => void;
  pages: ChromePage[];
  siteSlug: string;
}) {
  if (!design) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-fg-muted">
          The footer is one line: the year, the site&apos;s name and the legal links.
        </p>
        <Button size="sm" variant="outline" onClick={() => onChange({ ...emptyFooter(), copyright: DEFAULT_COPYRIGHT })}>
          Lay out a footer
        </Button>
      </div>
    );
  }

  const set = <K extends keyof FooterDesign>(key: K, value: FooterDesign[K]) => onChange({ ...design, [key]: value });
  const setContact = (key: keyof FooterDesign["contact"], value: string) => set("contact", { ...design.contact, [key]: value });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="footer-about">About the site</Label>
        <Textarea id="footer-about" rows={2} maxLength={FOOTER_LIMITS.about} value={design.about} onChange={(e) => set("about", e.target.value)} placeholder="A line or two under the site's name." />
      </div>

      <div className="space-y-2">
        <Label>Contact</Label>
        <Textarea aria-label="Address" rows={2} maxLength={FOOTER_LIMITS.address} value={design.contact.address} onChange={(e) => setContact("address", e.target.value)} placeholder="Street and number, postcode and town" />
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Phone" value={design.contact.phone} onChange={(e) => setContact("phone", e.target.value)} placeholder="+49 30 1234567" />
          <Input aria-label="Email" value={design.contact.email} onChange={(e) => setContact("email", e.target.value)} placeholder="hello@example.com" />
        </div>
      </div>

      <div>
        <Label>Profiles</Label>
        <SocialLinksEditor links={design.social} onChange={(social) => set("social", social)} linkTargets={pages} siteSlug={siteSlug} max={FOOTER_LIMITS.social} />
      </div>

      <div>
        <Label>Columns of links</Label>
        <ListEditor<FooterColumn>
          items={design.columns}
          onChange={(columns) => set("columns", columns)}
          newItem={() => ({ title: "", links: [{ label: "", href: "" }] })}
          addLabel="Add a column"
          max={FOOTER_LIMITS.columns}
          itemLabel={(c, i) => c.title || `Column ${i + 1}`}
          renderItem={(column, update, i) => (
            <div className="space-y-2">
              <Input
                aria-label={`Heading of column ${i + 1}`}
                value={column.title}
                maxLength={FOOTER_LIMITS.label}
                placeholder="Heading, e.g. Company"
                onChange={(e) => update({ ...column, title: e.target.value })}
                className="h-8 text-sm"
              />
              <ListEditor<FooterLink>
                items={column.links}
                onChange={(links) => update({ ...column, links })}
                newItem={() => ({ label: "", href: "" })}
                addLabel="Add a link"
                max={FOOTER_LIMITS.links}
                itemLabel={(l, j) => l.label || `Link ${j + 1}`}
                renderItem={(l, updateLink, j) => (
                  <div className="space-y-1.5">
                    <Input
                      aria-label={`Label of link ${j + 1} in column ${i + 1}`}
                      value={l.label}
                      maxLength={FOOTER_LIMITS.label}
                      placeholder="What the link says"
                      onChange={(e) => updateLink({ ...l, label: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <LinkField value={l.href} onChange={(href) => updateLink({ ...l, href })} pages={pages} siteSlug={siteSlug} ariaLabel={`Address of link ${j + 1} in column ${i + 1}`} />
                  </div>
                )}
              />
            </div>
          )}
        />
      </div>

      <div>
        <Label htmlFor="footer-copyright">Copyright line</Label>
        <Input id="footer-copyright" value={design.copyright} maxLength={FOOTER_LIMITS.line} placeholder={DEFAULT_COPYRIGHT} onChange={(e) => set("copyright", e.target.value)} />
        <p className="text-xs text-fg-subtle mt-1">
          <code>{"{year}"}</code> becomes this year and <code>{"{name}"}</code> the site&apos;s name. The legal pages are
          linked beside it on every page.
        </p>
      </div>

      <div>
        <Label>Background</Label>
        <ColorInput value={design.background} onChange={(background) => set("background", background)} inherit="The page's own" />
      </div>

      <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Back to the one-line footer</Button>
    </div>
  );
}
