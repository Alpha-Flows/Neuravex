"use client";
import type { SocialProps } from "@/types";
import { cn } from "@/lib/utils";
import { TOKEN } from "@/lib/site-theme";
import { cssColor } from "@/lib/css-value";
import { socialIcon } from "@/lib/social-icons";
import { socialHref, socialMenuName, socialRel } from "@/lib/social-links";

interface Props {
  props: SocialProps;
  onChange?: (next: SocialProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

const justify = { left: "flex-start", center: "center", right: "flex-end" } as const;

const sizes = ["sm", "md", "lg"] as const;
const shapes = ["none", "circle", "square"] as const;

/**
 * A row of icons linking to the author's profiles elsewhere.
 *
 * Drawn in the text colour it is given rather than in each network's own, so
 * one block reads on a white page and inside a dark footer section without
 * the author choosing anything: a section with a dark flat background sets a
 * light `color` on what it holds, and every mark here is `currentColor`. A
 * row of five brand colours is also five colours the site's palette never
 * asked for, which is why the brand colours are not offered at all.
 *
 * Every mark is inline SVG, not an image file, so the downloaded site needs
 * nothing fetched to draw it and a visitor's browser asks no network for a
 * logo before they have clicked anything.
 *
 * On the published page a link with no working address is left out — none
 * at all, or one that could not be finished into an address — because an
 * icon that goes nowhere, or to a 404 on the author's own site, is a promise
 * the page does not keep. On the canvas it is drawn faded instead, so the
 * author can see what is still to be filled in; it is the only difference
 * between the two, and preview shows the published row.
 */
export function SocialLinks({ props, disabled }: Props) {
  const links = Array.isArray(props.links) ? props.links : [];
  const entries = links
    .map((link, index) => ({ link, index, href: socialHref(link) }))
    .filter((entry) => !disabled || entry.href);

  if (entries.length === 0) {
    if (disabled) return null;
    // Something to click and select. An empty row has no height, and a block
    // with no height cannot be found on the canvas to be given its links.
    return (
      <p className="text-sm opacity-60 py-2" style={{ textAlign: props.align }}>
        No profiles yet — add them in the panel on the right.
      </p>
    );
  }

  const size = sizes.includes(props.size) ? props.size : "md";
  const shape = shapes.includes(props.shape) ? props.shape : "circle";
  const color = cssColor(props.color);

  return (
    <ul
      // Tailwind's reset takes the bullets off every list, and Safari's
      // VoiceOver then stops announcing it as a list at all. Saying so
      // explicitly puts back "list, 4 items", which is how a visitor using
      // one learns how many links there are before hearing each.
      role="list"
      aria-label="Social links"
      className={cn("nvx-social", `nvx-social-${size}`, `nvx-social-${shape}`)}
      style={{ justifyContent: justify[props.align] ?? "flex-start", color: color ?? undefined }}
    >
      {entries.map(({ link, index, href }) => {
        const icon = socialIcon(link.network);
        const name = socialMenuName(link.network);
        const unset = !href;
        return (
          <li key={index}>
            <a
              href={href || undefined}
              rel={href ? socialRel(link.network, href) : undefined}
              aria-label={unset ? `${name} (no address yet)` : name}
              title={unset ? `${name} — no address yet` : name}
              data-unset={unset ? "" : undefined}
              className="nvx-social-link"
              // Square follows the site's corner radius, as a button does,
              // but never past a quarter of the tile: a site set to round
              // everything would otherwise draw "square" as a circle, and the
              // two choices would be the same choice.
              style={shape === "square" ? { borderRadius: `min(${TOKEN.radius("0.375rem")}, 25%)` } : undefined}
            >
              <svg
                viewBox={icon.viewBox}
                aria-hidden="true"
                focusable="false"
                fill={icon.stroke ? "none" : "currentColor"}
                stroke={icon.stroke ? "currentColor" : undefined}
                strokeWidth={icon.stroke ? 2 : undefined}
                strokeLinecap={icon.stroke ? "round" : undefined}
                strokeLinejoin={icon.stroke ? "round" : undefined}
              >
                <path d={icon.path} />
              </svg>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
