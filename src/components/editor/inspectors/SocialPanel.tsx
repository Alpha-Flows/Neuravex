"use client";
import type { SocialLink, SocialNetwork, SocialProps } from "@/types";
import { Input } from "@/components/ui/Input";
import { SOCIAL_ICONS } from "@/lib/social-icons";
import {
  MAX_SOCIAL_LINKS,
  SOCIAL_PLACEHOLDERS,
  nextSocialNetwork,
  normaliseSocialHref,
  socialAddressNetwork,
  socialHrefProblem,
  socialMenuName,
} from "@/lib/social-links";
import { ColorInput, Field, LinkField, ListEditor, SegBtns, Select, type BlockPanelProps } from "../inspector-fields";

const NETWORK_OPTIONS = (Object.keys(SOCIAL_ICONS) as SocialNetwork[]).map((network) => ({
  value: network,
  label: socialMenuName(network),
}));

/**
 * The inspector for a row of profile links.
 *
 * What somebody types into a link box is finished into an address when they
 * leave the box, not on every keystroke. Finishing as they typed was tried
 * first, and it made a field that could not be emptied: backspacing an
 * Instagram address down to a single letter turned that letter back into a
 * whole Instagram address, one keystroke after another.
 *
 * A stored `#` is shown as an empty box. It is the empty value — what links
 * were created with before — and shown as itself it put the caret after it,
 * so the first thing anybody typed became a link to a spot on the page.
 */
export function SocialPanel({ block, onChange, linkTargets, siteSlug }: BlockPanelProps) {
  const p = block.props as SocialProps;
  const links: SocialLink[] = Array.isArray(p.links) ? p.links : [];
  const set = <K extends keyof SocialProps>(key: K, value: SocialProps[K]) =>
    onChange({ ...block, props: { ...block.props, [key]: value } });

  return (
    <>
      <Field label="Links">
        <SocialLinksEditor links={links} onChange={(next) => set("links", next)} linkTargets={linkTargets} siteSlug={siteSlug} />
      </Field>
      <Field label="Size">
        <Select
          value={p.size}
          onChange={(v) => set("size", v as SocialProps["size"])}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
        />
      </Field>
      <Field label="Shape">
        <SegBtns
          value={p.shape}
          options={["none", "circle", "square"] as const}
          onChange={(v) => set("shape", v)}
          nameFor={(v) => (v === "none" ? "No shape, the icons alone" : `Each icon on a ${v}`)}
        />
      </Field>
      <Field label="Align">
        <SegBtns value={p.align} options={["left", "center", "right"] as const} onChange={(v) => set("align", v)} />
      </Field>
      <Field label="Colour">
        <ColorInput value={p.color} onChange={(v) => set("color", v)} inherit="Page text colour" />
      </Field>
    </>
  );
}

/**
 * The list of profiles, on its own — the block's panel and the site footer's
 * settings both keep one, and each is finished and checked the same way.
 */
export function SocialLinksEditor({
  links,
  onChange,
  linkTargets,
  siteSlug,
  max = MAX_SOCIAL_LINKS,
}: {
  links: SocialLink[];
  onChange: (next: SocialLink[]) => void;
  linkTargets?: BlockPanelProps["linkTargets"];
  siteSlug?: string;
  max?: number;
}) {
  return (
    <ListEditor<SocialLink>
      items={links}
      onChange={onChange}
      newItem={() => ({ network: nextSocialNetwork(links), href: "" })}
      addLabel="Add a link"
      max={max}
      itemLabel={(link, i) => {
        const name = SOCIAL_ICONS[link.network]?.label ?? "Link";
        // Two links to the same network would both be "Move Website up"
        // to a screen reader; the position tells them apart.
        const twin = links.filter((l) => l.network === link.network).length > 1;
        return twin ? `${name} (${i + 1})` : name;
      }}
      renderItem={(link, update) => <LinkRow link={link} update={update} linkTargets={linkTargets} siteSlug={siteSlug} />}
    />
  );
}

function LinkRow({
  link,
  update,
  linkTargets,
  siteSlug,
}: {
  link: SocialLink;
  update: (next: SocialLink) => void;
  linkTargets?: BlockPanelProps["linkTargets"];
  siteSlug?: string;
}) {
  const problem = socialHrefProblem(link.network, link.href);
  const shown = link.href === "#" ? "" : (link.href ?? "");
  const label = `${socialMenuName(link.network)} address`;
  const finish = () => {
    const next = normaliseSocialHref(link.network, link.href ?? "");
    if (next !== link.href) update({ ...link, href: next });
  };

  return (
    <div className="space-y-1.5">
      {/* Labels wrap their controls, so each one is named for a screen reader
          without an id to keep unique across every row of the list. */}
      <label className="block">
        <span className="sr-only">Network</span>
        <Select
          value={link.network}
          onChange={(value) => {
            // An address that belongs to the network being switched away
            // from goes with it: an X icon linking to x.com, switched to
            // Instagram, was an Instagram icon that opened X. One that does
            // not — typed under the wrong network first, say — is kept.
            const network = value as SocialNetwork;
            const stale = socialAddressNetwork(link.href) === link.network;
            update({ network, href: stale ? "" : link.href });
          }}
          options={NETWORK_OPTIONS}
        />
      </label>
      {link.network === "website" ? (
        // A website link may be one of this site's own pages — an "about me"
        // behind the globe — so it gets the page picker a button has. `blur`
        // bubbles from the box inside it in React, which is what lets the
        // address be finished here without a second kind of link field.
        <div onBlur={finish}>
          <LinkField
            value={shown}
            onChange={(href) => update({ ...link, href })}
            pages={linkTargets}
            siteSlug={siteSlug}
            ariaLabel={label}
          />
        </div>
      ) : (
        <label className="block">
          <span className="sr-only">{label}</span>
          <Input
            value={shown}
            placeholder={SOCIAL_PLACEHOLDERS[link.network]}
            onChange={(e) => update({ ...link, href: e.target.value })}
            onBlur={finish}
            spellCheck={false}
            autoCapitalize="off"
            className="text-xs"
          />
        </label>
      )}
      {problem ? <p className="text-[11px] text-amber-400">{problem}</p> : null}
    </div>
  );
}
