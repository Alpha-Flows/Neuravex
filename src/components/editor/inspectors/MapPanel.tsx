"use client";
import { useState } from "react";
import type { MapProps } from "@/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Field, SegBtns, Toggle, type BlockPanelProps } from "../inspector-fields";
import { editedText, hasFormatting, plainText } from "@/lib/inline-text";
import {
  MAP_LINK_LABELS,
  MAX_ZOOM,
  MIN_ZOOM,
  formatCoordinates,
  osmLinkUrl,
  parseMapLocation,
} from "@/lib/map-location";

type Outcome = { tone: "placed" | "check" | "refused"; text: string };

const TONE: Record<Outcome["tone"], string> = {
  placed: "text-emerald-400",
  check: "text-amber-300",
  refused: "text-amber-400",
};

/**
 * The map block's panel.
 *
 * There is no search box, because a search box is a geocoder and a geocoder
 * is somebody else's server: Neuravex would be sending every address every
 * customer typed to it. The author finds the place on a map they already
 * use and pastes the link, or the coordinates, and this reads the position
 * out of it without going online. When it cannot — a short link, a link that
 * only names the place — it says why, and what to paste instead.
 *
 * The mode switch carries its privacy consequence beside it, in words,
 * because that is the moment the decision is made. It does not promise that
 * the privacy notice will follow: the notice is a page written when the
 * operator runs Impressum & Datenschutz, and it stays as it was written until
 * they run it again. It said "will name it" at first, which was true only of
 * a notice not yet made.
 *
 * The panel started with eleven controls and a hundred and eighty words.
 * The link texts are edited where they are, on the canvas, so their boxes
 * went; the numbers under the pin are for fixing a pin rather than placing
 * one, so they fold away.
 */
export function MapPanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as MapProps;
  const set = (patch: Partial<MapProps>) => onChange({ ...block, props: { ...p, ...patch } });

  // What was pasted, and what came of it, belong to the block it was pasted
  // for. The panel is the same component from one map to the next, so held
  // on their own they followed the selection: another map's panel said "Pin
  // placed at 33.8568° S" about a pin it had never had.
  const [paste, setPaste] = useState<{ blockId: string; text: string; outcome: Outcome | null }>({
    blockId: block.id,
    text: "",
    outcome: null,
  });
  const mine = paste.blockId === block.id;
  const pasted = mine ? paste.text : "";
  const outcome = mine ? paste.outcome : null;
  const setPasted = (text: string, result: Outcome | null = null) => setPaste({ blockId: block.id, text, outcome: result });

  function place(text: string) {
    const result = parseMapLocation(text);
    if (!result.ok) {
      setPasted(text.trim(), { tone: "refused", text: result.reason });
      return;
    }
    const { lat, lng, zoom, centreOnly } = result.location;
    const round = (v: number) => Math.round(v * 1e6) / 1e6;
    set({ lat: round(lat), lng: round(lng), ...(zoom !== undefined ? { zoom } : {}) });
    setPasted(
      text.trim(),
      centreOnly
        ? {
            tone: "check",
            text: "This link only gave the centre of the view, which can be a street or two from the place — check the pin.",
          }
        : { tone: "placed", text: `Pin placed at ${formatCoordinates(lat, lng)}${zoom !== undefined ? `, zoom ${zoom}` : ""}.` },
    );
  }

  function setMode(mode: MapProps["mode"]) {
    // A label still reading as the old mode's default follows the mode, so
    // "Open in OpenStreetMap" under a frame becomes "Open larger map"; one
    // the author wrote is theirs and stays.
    const wasDefault = !p.linkLabel || p.linkLabel === MAP_LINK_LABELS[p.mode];
    set({ mode, ...(wasDefault ? { linkLabel: MAP_LINK_LABELS[mode] } : {}) });
  }

  const checkLink = (
    <a
      href={osmLinkUrl(p.lat, p.lng, p.zoom)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-fg-muted hover:text-fg underline"
    >
      Check the pin on OpenStreetMap ↗
    </a>
  );

  return (
    <>
      <Field label="Address">
        {/* Plain words in the box, the stored form on the page: typed
            straight in as HTML, "Hauptstr. 5 <Hinterhaus>" lost its last
            word to the sanitiser and "&" came back as "&amp;". */}
        <Input
          aria-label="Address"
          value={plainText(p.address)}
          placeholder="Street, postcode and town"
          onChange={(e) => set({ address: editedText(p.address, e.target.value) })}
        />
        <p className="text-[11px] text-fg-subtle mt-1">
          {hasFormatting(p.address) ? "Typing here drops the formatting added on the page. " : ""}
          It does not move the pin.
        </p>
      </Field>

      <Field label="Map link or coordinates">
        <div className="flex gap-2">
          <Input
            aria-label="Map link or coordinates"
            value={pasted}
            placeholder="52.5163, 13.3777 or a map link"
            onChange={(e) => setPasted(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (!text.trim()) return;
              // The paste replaces whatever was in the field: a link pasted
              // after half of another one is never what was meant.
              e.preventDefault();
              place(text);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                place(pasted);
              }
            }}
          />
          <Button size="sm" variant="outline" onClick={() => place(pasted)} className="shrink-0 h-9">
            Place pin
          </Button>
        </div>
        <p role="status" className={`text-[11px] mt-1 ${outcome ? TONE[outcome.tone] : "text-fg-subtle"}`}>
          {outcome ? outcome.text : "Paste the link from OpenStreetMap or Google Maps, or the coordinates."}
          {outcome?.tone === "check" ? <> {checkLink}</> : null}
        </p>
      </Field>

      <details className="rounded-md border border-bg-border px-2.5 py-2 text-xs">
        <summary className="cursor-pointer select-none text-fg-muted hover:text-fg">
          Fine-tune the pin <span className="text-fg-subtle">· {formatCoordinates(p.lat, p.lng)}</span>
        </summary>
        <div className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Latitude" value={p.lat} min={-90} max={90} onCommit={(lat) => set({ lat })} />
            <NumberField label="Longitude" value={p.lng} min={-180} max={180} onCommit={(lng) => set({ lng })} />
          </div>
          <NumberField
            // The drawing is the same at every zoom; only the link, and a
            // live map, use it.
            label={p.mode === "embed" ? "Zoom" : "Zoom of the linked map"}
            value={p.zoom}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            integer
            onCommit={(zoom) => set({ zoom })}
            hint={zoomWords(p.zoom)}
          />
          <p className="text-[11px]">{checkLink}</p>
        </div>
      </details>

      <Field label="Show as">
        <SegBtns
          value={p.mode}
          options={["card", "embed"] as const}
          onChange={setMode}
          labelFor={(mode) => (mode === "card" ? "Drawn" : "Live map")}
          nameFor={(mode) => (mode === "card" ? "Drawn map, part of the page" : "Live map from OpenStreetMap")}
        />
        <p className="text-[11px] text-fg-subtle mt-1.5 leading-relaxed">
          {p.mode === "embed" ? (
            <>
              <span className="text-amber-300">
                Every visitor&rsquo;s browser loads the live map from openstreetmap.org as the page opens, which hands
                OpenStreetMap their IP address.
              </span>{" "}
              In Germany that may need the visitor&rsquo;s consent, which Neuravex does not ask for. If you have
              already made the privacy notice, run Impressum &amp; Datenschutz again so it names openstreetmap.org.
            </>
          ) : (
            <>The drawn map is part of the page and makes no request to anybody. A live map is loaded from openstreetmap.org by every visitor.</>
          )}
        </p>
      </Field>

      {p.mode === "embed" ? (
        <NumberField
          label="Map height (px)"
          value={p.height}
          min={160}
          max={900}
          integer
          onCommit={(height) => set({ height })}
        />
      ) : null}

      <Toggle
        label="Also link to Google Maps"
        checked={p.googleLink !== false}
        onChange={(googleLink) => set({ googleLink })}
        hint="Only a link: nothing loads from Google until a visitor clicks it."
      />
    </>
  );
}

/**
 * A number typed a character at a time.
 *
 * Bound straight to the prop, a field holding 52.5 could not be emptied to
 * type a new latitude — the empty field is not a number, so the prop kept
 * its value and the field snapped back to it — and "-" on the way to "-33"
 * vanished the same way. So what is typed is kept as typed while the field has
 * focus, only a number in range is handed on, and leaving the field shows the
 * stored value again. A decimal comma is read as a point, because that is how
 * half the people using this write a number.
 */
function NumberField({
  label,
  value,
  min,
  max,
  integer,
  onCommit,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  integer?: boolean;
  onCommit: (next: number) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const read = (text: string) => {
    const trimmed = text.trim().replace(",", ".");
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };
  const parsed = draft === null ? value : read(draft);
  const invalid = draft !== null && (parsed === null || parsed < min || parsed > max);

  return (
    <Field label={label}>
      <Input
        aria-label={label}
        inputMode={integer ? "numeric" : "decimal"}
        value={draft ?? String(value)}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const n = read(text);
          if (n !== null && n >= min && n <= max) onCommit(integer ? Math.round(n) : n);
        }}
        onBlur={() => setDraft(null)}
      />
      {invalid ? (
        <p className="text-[11px] text-amber-400 mt-1">A number from {min} to {max}.</p>
      ) : hint ? (
        <p className="text-[11px] text-fg-subtle mt-1">{hint}</p>
      ) : null}
    </Field>
  );
}

/** What a zoom level shows, in words, because "16" means nothing on its own. */
function zoomWords(zoom: number): string {
  if (zoom >= 18) return "Close enough to see single buildings.";
  if (zoom >= 16) return "A few streets around the pin.";
  if (zoom >= 13) return "The neighbourhood.";
  if (zoom >= 10) return "The whole town.";
  if (zoom >= 6) return "The region.";
  return "The country, or more.";
}
