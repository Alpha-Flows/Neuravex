"use client";
import type { MapProps } from "@/types";
import { Editable } from "./Editable";
import { cn } from "@/lib/utils";
import { TOKEN } from "@/lib/site-theme";
import { isAllowedEmbed } from "@/lib/embed-hosts";
import {
  MAP_LINK_LABELS,
  addressText,
  drawingVariant,
  formatCoordinates,
  googleMapsUrl,
  osmEmbedUrl,
  osmLinkUrl,
} from "@/lib/map-location";

interface Props {
  props: MapProps;
  onChange?: (next: MapProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

/**
 * Where to find somebody, drawn two ways.
 *
 * The card is the default because it asks nothing of anybody: the map on it
 * is a drawing in the page itself, with the place's own pin, and the only way
 * off the page is a link the visitor chooses to follow. A real map from a
 * tile server would have been the obvious thing to draw there, and it would
 * have made every page view a request to that server — which is exactly what
 * the embedded mode is, and why it is the author's decision to switch to it,
 * and one the privacy notice has to be written again to cover.
 *
 * The embedded map is a frame from openstreetmap.org, sandboxed to what the
 * map needs (its own scripts, and its links opening a new tab) and loaded
 * lazily so a map at the foot of a long page is only fetched by a visitor who
 * scrolls to it. On the canvas a transparent sheet lies over the frame: a
 * click inside a frame never reaches the page around it, so without the sheet
 * clicking the map panned it instead of selecting the block, and there was no
 * way to select an embedded map at all except through the outline.
 */
export function MapBlock({ props, onChange, disabled }: Props) {
  const { lat, lng, zoom } = props;
  const radius = TOKEN.radius("0.75rem");
  const embedSrc = props.mode === "embed" ? osmEmbedUrl(lat, lng, zoom) : "";
  // Built from three numbers, so it is always an openstreetmap.org address —
  // but the frame is the one thing here that is somebody else's document, so
  // it is checked against the same list the CSP and the sanitiser use.
  const embedded = embedSrc !== "" && isAllowedEmbed(embedSrc);
  const place = addressText(props.address);
  const editing = !disabled && !!onChange;
  const variant = drawingVariant(lat, lng);

  const address =
    editing || place ? (
      <Editable
        as="p"
        className="nvx-map-address"
        value={props.address}
        onChange={(next) => onChange?.({ ...props, address: next })}
        disabled={!editing}
        placeholder="Street, postcode and town"
      />
    ) : null;

  const links = (
    <p className="nvx-map-links">
      <MapLink
        href={osmLinkUrl(lat, lng, zoom)}
        primary
        value={props.linkLabel}
        fallback={embedded ? MAP_LINK_LABELS.embed : MAP_LINK_LABELS.card}
        editing={editing}
        onChange={(linkLabel) => onChange?.({ ...props, linkLabel })}
      />
      {props.googleLink !== false ? (
        <MapLink
          href={googleMapsUrl(lat, lng)}
          value={props.googleLabel}
          fallback={MAP_LINK_LABELS.google}
          editing={editing}
          onChange={(googleLabel) => onChange?.({ ...props, googleLabel })}
        />
      ) : null}
    </p>
  );

  if (embedded) {
    return (
      <div className="nvx-map">
        <figure className="nvx-map-figure nvx-map-embed">
          <div className="nvx-map-frame" style={{ height: props.height, borderRadius: radius }}>
            {/* Seen while the frame loads. A frame that fails is covered by the
                browser's own error page, which is opaque, so this is not a
                fallback for a visitor who is offline — only something better
                than an empty box for the second before the map arrives. */}
            <MapDrawing variant={variant} />
            <iframe
              src={embedSrc}
              title={place ? `Map of ${place}` : "Map"}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              className="nvx-map-iframe"
            />
            {editing ? (
              <>
                <div className="nvx-map-shield" aria-hidden="true" />
                <span className="nvx-block-chrome nvx-map-hint">Preview the page to move the map</span>
              </>
            ) : null}
          </div>
          <figcaption className="nvx-map-caption">
            {address}
            {links}
          </figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div className="nvx-map">
      <figure className="nvx-map-figure nvx-map-card" style={{ borderRadius: radius }}>
        <MapDrawing variant={variant} />
        <figcaption className="nvx-map-caption">
          {address}
          <p className="nvx-map-coords">{formatCoordinates(lat, lng)}</p>
          {links}
        </figcaption>
      </figure>
    </div>
  );
}

/**
 * One of the links under the map, its words editable in place.
 *
 * The words are a prop because the page may not be in English. An empty label
 * reads as the default on the published page rather than as a link with
 * nothing in it, which a screen reader would announce as a bare address.
 */
function MapLink({
  href,
  primary,
  value,
  fallback,
  editing,
  onChange,
}: {
  href: string;
  primary?: boolean;
  value: string;
  fallback: string;
  editing: boolean;
  onChange: (next: string) => void;
}) {
  const shown = editing || addressText(value) ? value : fallback;
  return (
    <a href={href} className={cn("nvx-map-link", primary && "nvx-map-link-primary")}>
      <Editable as="span" value={shown} onChange={onChange} disabled={!editing} placeholder={fallback} />
      <span className="nvx-map-link-arrow" aria-hidden="true">↗</span>
    </a>
  );
}

/**
 * A map drawn in the page: streets, a park, a river and the pin.
 *
 * Every line is `currentColor` at a low opacity and every accent is the
 * site's, so the same drawing reads on a white page and inside a dark
 * section without a colour of its own to go wrong. It is not the place's real
 * street plan — nothing is fetched to know that — so it is hidden from screen
 * readers, and the pin, which is always in the middle, is the only thing it
 * claims. Which way round the streets run comes from the coordinates, so two
 * places on one page do not look like one card drawn twice; every mirroring
 * keeps the middle where it is, and with it the pin.
 */
const MIRROR = ["", "matrix(-1 0 0 1 640 0)", "matrix(1 0 0 -1 0 360)", "matrix(-1 0 0 -1 640 360)"] as const;

function MapDrawing({ variant }: { variant: 0 | 1 | 2 | 3 }) {
  return (
    <div className="nvx-map-art" aria-hidden="true">
      <svg className="nvx-map-streets" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">
        <g transform={MIRROR[variant] || undefined}>
          <rect className="nvx-map-park" x="396" y="34" width="136" height="98" rx="14" />
          <path className="nvx-map-water" d="M-30 318C80 282 170 300 252 330S430 372 520 322 628 258 670 266" />
          <g className="nvx-map-buildings">
            <rect x="262" y="118" width="40" height="46" rx="3" />
            <rect x="338" y="124" width="60" height="38" rx="3" />
            <rect x="258" y="198" width="46" height="32" rx="3" />
            <rect x="340" y="196" width="36" height="30" rx="3" />
            <rect x="176" y="68" width="56" height="40" rx="3" />
            <rect x="486" y="200" width="54" height="26" rx="3" />
            <rect x="92" y="200" width="54" height="30" rx="3" />
          </g>
          <path
            className="nvx-map-road-minor"
            d="M0 54H640M0 108H640M0 250H640M84 0V360M164 0V360M246 0V360M394 0V360M476 0V360M560 0V360"
          />
          <path className="nvx-map-road-major" d="M0 180H640M320 0V360M-20 352L660 20" />
        </g>
      </svg>
      <svg className="nvx-map-pin" viewBox="0 0 32 44" width="32" height="44">
        <ellipse className="nvx-map-pin-shadow" cx="16" cy="41" rx="7" ry="2.5" />
        <path
          className="nvx-map-pin-body"
          d="M16 1.5C8.5 1.5 2.5 7.4 2.5 14.8 2.5 24.6 16 39.5 16 39.5S29.5 24.6 29.5 14.8C29.5 7.4 23.5 1.5 16 1.5Z"
        />
        <circle className="nvx-map-pin-dot" cx="16" cy="14.5" r="5" />
      </svg>
    </div>
  );
}
