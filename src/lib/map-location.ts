/**
 * Where a map block points, read from whatever the author pasted.
 *
 * The obvious way to put a place on a map is to type its address and let a
 * geocoder find it. Neuravex cannot do that: it makes no network calls of its
 * own, and a geocoder is somebody else's server that would learn every
 * address every customer ever typed. So the author brings the position with
 * them — the coordinates, or the link from the address bar of the map they
 * already found the place on — and this module reads it.
 *
 * It reads a lot of shapes, because a map link is whatever the map happened
 * to put in the address bar that day. A Google link for one shop carries the
 * position of the pin (`!3d…!4d…`) and, separately, the centre of the view it
 * was shared from (`@…`), and the two can be two hundred metres apart — the
 * pin is the one that means "here", so it wins. An OpenStreetMap search keeps
 * the name that was searched for in `query` and the view in the fragment. A
 * short link (`maps.app.goo.gl/…`) says nothing at all until Google's server
 * is asked where it leads, and asking is exactly what this app does not do;
 * that case gets a reason the panel can show, rather than a guess. The one
 * short link that can be read offline is OpenStreetMap's own (`osm.org/go/…`),
 * because the position is encoded in the link itself.
 *
 * Nothing here is imported by the server alone — the inspector parses in the
 * browser as the author pastes — so it has no dependencies at all.
 */

export interface MapLocation {
  lat: number;
  lng: number;
  /** Only when the link said; plain coordinates leave the zoom as it was. */
  zoom?: number;
  /**
   * True when the link named a place but the only position in it was the
   * centre of the view it was shared from. Google writes a place's pin into
   * `data=`, and a link without it — a directions link cut short, a place
   * link somebody trimmed — still carries `@lat,lng`, which can be a street
   * or two from the door. The pin goes there anyway, and the panel says to
   * check it rather than reporting it placed.
   */
  centreOnly?: boolean;
}

export type MapLocationResult = { ok: true; location: MapLocation } | { ok: false; reason: string };

/** OpenStreetMap's closest zoom is 19, and 1 already shows the whole world. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 19;

// ---------------------------------------------------------------------------
// What the panel says when it cannot help
// ---------------------------------------------------------------------------

const EMPTY = "Paste a link from OpenStreetMap or Google Maps, or the coordinates of the place.";

const UNREADABLE =
  "Neuravex could not read a position from that. Coordinates look like 52.5163, 13.3777 — latitude first, " +
  "then longitude — or paste a link from OpenStreetMap or Google Maps. A street address on its own cannot be " +
  "looked up without going online, which Neuravex does not do.";

const OUT_OF_RANGE =
  "Latitude has to be between -90 and 90, and longitude between -180 and 180. Coordinates are written " +
  "latitude first, then longitude.";

const NOT_A_MAP =
  "That is not a map link Neuravex knows how to read. Paste a link from OpenStreetMap or Google Maps, or " +
  "coordinates such as 52.5163, 13.3777.";

const NO_POSITION =
  "That map link does not say where the place is. Open it, let the map move to the place, and paste the " +
  "address from the browser's address bar — or the coordinates.";

const shortLink = (host: string) =>
  `That is a short link (${host}), and it only says where it leads when its owner's server is asked — which ` +
  "Neuravex does not do on your behalf. Open it in your browser, wait for the map to show the place, and paste " +
  "the long address from the address bar instead.";

const PLACE_NAME =
  "That link names the place rather than saying where it is, and finding it would mean asking Google. Open the " +
  "link, right-click the pin and copy the coordinates at the top of the menu, then paste them here.";

const OSM_SEARCH =
  "That is an OpenStreetMap search for a name, and the link does not say where the result is. Open it, click " +
  "the result so the map moves there, and paste the address from the address bar.";

const fail = (reason: string): MapLocationResult => ({ ok: false, reason });

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/** A pasted link, coordinates or embed code, read into a position. */
export function parseMapLocation(input: unknown): MapLocationResult {
  if (typeof input !== "string") return fail(EMPTY);
  const text = input.trim();
  if (!text) return fail(EMPTY);
  // Share dialogs hand out an <iframe> a few hundred characters long; a
  // megabyte of paste is not a map link and is not worth scanning.
  if (text.length > 8000) return fail(UNREADABLE);

  if (/^geo:/i.test(text)) return fromGeoUri(text);

  const url = findUrl(text);
  if (url) return fromUrl(url);

  const pair = readPair(text);
  if (!pair) return fail(UNREADABLE);
  return checked(pair.lat, pair.lng);
}

function checked(lat: number, lng: number, zoom?: number, centreOnly = false): MapLocationResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail(UNREADABLE);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail(OUT_OF_RANGE);
  const location: MapLocation = { lat, lng };
  if (zoom !== undefined && Number.isFinite(zoom)) location.zoom = clampZoom(zoom);
  if (centreOnly) location.centreOnly = true;
  return { ok: true, location };
}

/** A zoom a map will draw: a whole number from 1 to 19. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 16;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)));
}

// ---------------------------------------------------------------------------
// Plain coordinates
// ---------------------------------------------------------------------------

/*
 * One coordinate: decimal degrees, or degrees with minutes and seconds, and a
 * hemisphere letter before or after it. `O` is there because a German map
 * writes east as Ost, and a German author pastes "13,3777° O".
 *
 * No two `\s*` sit side by side with only something optional between them.
 * Written that way (`\s*°?\s*`), a run of spaces can be split between the
 * two in as many ways as it is long, and a failing match tries every one.
 */
const NUMBER = String.raw`(\d{1,3}(?:\.\d+)?)(?:\s*°)?(?:\s*(\d{1,2}(?:\.\d+)?)\s*'(?:\s*(\d{1,2}(?:\.\d+)?)\s*")?)?`;
const LEADING = new RegExp(String.raw`\s*([NSEWO])\s*(?:([+-])\s*)?${NUMBER}`, "iy");
const TRAILING = new RegExp(String.raw`\s*(?:([+-])\s*)?${NUMBER}(?:\s*([NSEWO])(?![a-z]))?`, "iy");

type Axis = "lat" | "lng" | null;

interface Component {
  value: number;
  axis: Axis;
  end: number;
}

function readComponent(text: string, at: number): Component | null {
  LEADING.lastIndex = at;
  const leading = LEADING.exec(text);
  let letter: string | undefined;
  let sign: string | undefined;
  let degrees: string;
  let minutes: string | undefined;
  let seconds: string | undefined;
  let end: number;
  if (leading) {
    [, letter, sign, degrees, minutes, seconds] = leading;
    end = LEADING.lastIndex;
  } else {
    TRAILING.lastIndex = at;
    const trailing = TRAILING.exec(text);
    if (!trailing) return null;
    [, sign, degrees, minutes, seconds, letter] = trailing;
    end = TRAILING.lastIndex;
  }

  // 52.5°30' is not a position anybody wrote on purpose, and neither is a
  // minute or a second of sixty or more.
  if (minutes !== undefined && degrees.includes(".")) return null;
  if (seconds !== undefined && minutes?.includes(".")) return null;
  if (minutes !== undefined && Number(minutes) >= 60) return null;
  if (seconds !== undefined && Number(seconds) >= 60) return null;

  let value = Number(degrees) + (minutes ? Number(minutes) / 60 : 0) + (seconds ? Number(seconds) / 3600 : 0);
  const hemisphere = letter?.toUpperCase();
  // A minus sign and a hemisphere both say which side of the line the place
  // is on; when both are given there is no telling which one was meant.
  if (hemisphere && sign) return null;
  if (sign === "-" || hemisphere === "S" || hemisphere === "W") value = -value;
  const axis: Axis = hemisphere === "N" || hemisphere === "S" ? "lat" : hemisphere ? "lng" : null;
  return { value, axis, end };
}

/**
 * Normalises the typography people paste coordinates with, and takes off a
 * `loc:` and the brackets Google and Android put round a position. The
 * brackets are taken off by trimming and slicing rather than by a pattern
 * such as `\s*[)\]]\s*$`, which retries from every space in a long run of
 * them.
 */
function tidy(text: string): string {
  let out = text
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″“”]|''/g, '"')
    .replace(/º/g, "°")
    .replace(/−/g, "-")
    .trim();
  if (/^loc:/i.test(out)) out = out.slice(4).trim();
  if (out.startsWith("(") || out.startsWith("[")) out = out.slice(1).trim();
  if (out.endsWith(")") || out.endsWith("]")) out = out.slice(0, -1).trim();
  if (/^loc:/i.test(out)) out = out.slice(4).trim();
  return out;
}

function readPairStrict(text: string): { lat: number; lng: number } | null {
  const first = readComponent(text, 0);
  if (!first) return null;
  const separator = /\s*[,;/]?\s*/y;
  separator.lastIndex = first.end;
  separator.exec(text);
  // Something has to stand between the two numbers: "52°30" is one
  // coordinate with its minute mark missing, not 52 and 30.
  if (!/[\s,;/NSEWO]$/i.test(text.slice(0, separator.lastIndex))) return null;
  const second = readComponent(text, separator.lastIndex);
  if (!second || text.slice(second.end).trim() !== "") return null;

  let { axis: a } = first;
  let { axis: b } = second;
  if (a && b && a === b) return null;
  if (a && !b) b = a === "lat" ? "lng" : "lat";
  if (b && !a) a = b === "lat" ? "lng" : "lat";
  // Neither said which is which: latitude first, as every map writes it.
  if (!a) return { lat: first.value, lng: second.value };
  return a === "lat" ? { lat: first.value, lng: second.value } : { lat: second.value, lng: first.value };
}

/**
 * Two coordinates, in whatever notation they came in.
 *
 * A decimal comma is read too, but only where it cannot be a separator: in
 * "52,5163 13,3777" or "52,5163; 13,3777" every comma sits between two
 * digits. "52,5163, 13,3777" is clear enough to a person, but the rule that
 * would read it would also read "52,13, 5" one way or another, and this has
 * to be a rule that never guesses — so it is refused, with an example.
 */
export function readPair(input: string): { lat: number; lng: number } | null {
  // Measured before anything else is done to it: the longest way anybody
  // writes two coordinates is well under a hundred characters.
  if (typeof input !== "string" || input.length > 200) return null;
  const text = tidy(input);
  if (!text) return null;
  const strict = readPairStrict(text);
  if (strict) return strict;
  const commas = text.match(/,/g)?.length ?? 0;
  if (commas === 2 && !/,(?!\d)|(?<!\d),/.test(text)) {
    return readPairStrict(text.replace(/(\d),(\d)/g, "$1.$2"));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const SHORT_LINK_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co", "g.page", "share.google", "maps.apple", "bit.ly", "t.co"]);

/**
 * The first link in what was pasted, if there is one.
 *
 * OpenStreetMap's share dialog hands out an <iframe> followed by a "View
 * larger map" anchor, and Google's hands out an <iframe> too; both are pasted
 * whole, with `&amp;` where the link had `&`. The first map link in the text
 * is the one read.
 */
function findUrl(text: string): URL | null {
  const found: string[] = [];
  if (!/\s/.test(text) && /^(?:https?:)?\/\//i.test(text)) {
    // One link on its own is taken whole. Scanning it would stop at the first
    // quote, and Google writes a place's coordinates into the path with
    // quotes in them: /maps/place/52°30'58.7"N+13°22'39.7"E.
    found.push(text);
  } else if (!/\s/.test(text) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#]|$)/i.test(text)) {
    // A bare host with a path, as somebody types it: "www.openstreetmap.org/#map=…".
    found.push(`https://${text}`);
  } else {
    // Embed code: the links sit in quoted attributes.
    found.push(...(text.match(/(?:https?:)?\/\/[^\s"'<>]+/gi) ?? []));
  }
  let firstUrl: URL | null = null;
  for (const candidate of found) {
    const href = candidate.replace(/&amp;/gi, "&").replace(/^\/\//, "https://");
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (mapService(url.hostname)) return url;
    firstUrl ??= url;
  }
  return firstUrl;
}

type Service = "osm" | "google" | "apple" | "short";

function mapService(hostname: string): Service | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const bare = host.replace(/^www\./, "");
  if (SHORT_LINK_HOSTS.has(bare)) return "short";
  if (bare === "openstreetmap.org" || bare === "osm.org" || bare === "openstreetmap.de") return "osm";
  // google.com, google.de, google.co.uk, maps.google.com.au and the rest.
  if (/^(?:maps\.)?google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(bare)) return "google";
  if (bare === "maps.apple.com") return "apple";
  return null;
}

function fromUrl(url: URL): MapLocationResult {
  switch (mapService(url.hostname)) {
    case "short":
      return fail(shortLink(url.hostname.replace(/^www\./, "")));
    case "osm":
      return fromOpenStreetMap(url);
    case "google":
      return fromGoogle(url);
    case "apple":
      return fromApple(url);
    default:
      return fail(NOT_A_MAP);
  }
}

/** A number from a URL, or NaN. `Number("")` is 0, which is a real latitude. */
function num(value: string | null | undefined): number {
  if (value == null || value.trim() === "") return NaN;
  return Number(value);
}

/** A query parameter that holds coordinates, such as `q=52.5,13.3`. */
function pairParam(url: URL, ...names: string[]): { lat: number; lng: number } | null {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    // `q=52.5,13.3(Our shop)` is how an Android share labels the pin.
    const pair = readPair(value.replace(/\(.*\)\s*$/, ""));
    if (pair) return pair;
  }
  return null;
}

function decodedPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname.replace(/\+/g, " "));
  } catch {
    return url.pathname;
  }
}

// OpenStreetMap -------------------------------------------------------------

function fromOpenStreetMap(url: URL): MapLocationResult {
  const path = url.pathname;

  const shortCode = /^\/go\/([A-Za-z0-9_~@-]+)/.exec(path)?.[1];
  if (shortCode) {
    const decoded = decodeOsmShortLink(shortCode);
    return decoded ? checked(decoded.lat, decoded.lng, decoded.zoom) : fail(NO_POSITION);
  }

  // `#map=16/52.51630/13.37770`, sometimes followed by `&layers=…`.
  const hash = /(?:^#|&)map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash);
  const hashZoom = hash ? num(hash[1]) : NaN;
  const zoomParam = num(url.searchParams.get("zoom"));
  const zoom = Number.isFinite(hashZoom) ? hashZoom : Number.isFinite(zoomParam) ? zoomParam : undefined;

  // The marker is the place; the view around it is only where the map was.
  const mlat = num(url.searchParams.get("mlat"));
  const mlon = num(url.searchParams.get("mlon"));
  if (Number.isFinite(mlat) && Number.isFinite(mlon)) return checked(mlat, mlon, zoom);

  const marker = pairParam(url, "marker");
  const bbox = (url.searchParams.get("bbox") ?? "").split(",").map(num);
  const bboxZoom = bbox.length === 4 && bbox.every(Number.isFinite) ? zoomForSpan(bbox[2] - bbox[0]) : undefined;
  if (marker) return checked(marker.lat, marker.lng, zoom ?? bboxZoom);

  // A search for coordinates is itself the answer; a search for a name is
  // only answered by the view it was shared from, if there is one.
  const query = url.searchParams.get("query");
  const searched = query ? readPair(query) : null;
  if (searched) return checked(searched.lat, searched.lng, zoom);

  // A search's view is wherever the map was when the name was searched for,
  // which is not necessarily where the result is.
  if (hash) return checked(num(hash[2]), num(hash[3]), zoom, path.startsWith("/search"));

  // The permalinks OpenStreetMap wrote before the fragment, which
  // openstreetmap.de still writes: `?lat=…&lon=…&zoom=…`.
  const lat = num(url.searchParams.get("lat"));
  const lon = num(url.searchParams.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon)) return checked(lat, lon, zoom);

  if (bboxZoom !== undefined) return checked((bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2, bboxZoom);

  return fail(query ? OSM_SEARCH : NO_POSITION);
}

/*
 * OpenStreetMap's short links carry the position in the link: the
 * longitude and latitude, each scaled to 32 bits, interleaved a bit at a time
 * and written six bits to a character, with a `-` for each zoom level short of
 * a whole character. This is the decoder from the openstreetmap-website
 * source, which is short enough to carry rather than to ask a server about.
 */
const SHORT_LINK_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~";

export function decodeOsmShortLink(code: string): MapLocation | null {
  // Built up by multiplying rather than shifting: each axis runs to 32 bits,
  // and JavaScript's shift operators work on 32-bit signed integers, so the
  // top bit would come back as a minus sign.
  let x = 0;
  let y = 0;
  let z = 0;
  let zOffset = 0;
  // The old alphabet used `@`, which Twitter mangled, so `~` replaced it.
  for (const c of code.replace(/@/g, "~")) {
    const t = SHORT_LINK_ALPHABET.indexOf(c);
    if (t < 0) {
      if (c !== "-") return null;
      zOffset -= 1;
      continue;
    }
    if (zOffset !== 0) return null;
    let bits = t;
    for (let i = 0; i < 3; i++) {
      x = x * 2 + (bits & 32 ? 1 : 0);
      bits <<= 1;
      y = y * 2 + (bits & 32 ? 1 : 0);
      bits <<= 1;
    }
    z += 3;
  }
  if (z === 0 || z > 32) return null;
  x *= 2 ** (32 - z);
  y *= 2 ** (32 - z);
  const lng = (x * 360) / 2 ** 32 - 180;
  const lat = (y * 180) / 2 ** 32 - 90;
  const zoom = z - 8 - (((zOffset % 3) + 3) % 3);
  return { lat, lng, zoom: clampZoom(zoom) };
}

// Google Maps -----------------------------------------------------------------

function fromGoogle(url: URL): MapLocationResult {
  const host = url.hostname.toLowerCase();
  if (!host.startsWith("maps.") && !url.pathname.startsWith("/maps")) return fail(NOT_A_MAP);

  const path = decodedPath(url);
  const whole = `${path}${url.search}`;
  // A link to a place, a search or a route, as against a bare view of the map.
  const kind = /^\/maps\/(place|search|dir)\//.exec(path)?.[1];

  const view = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/.exec(path);
  const zParam = num(url.searchParams.get("z") ?? url.searchParams.get("zoom"));
  const zoom = view?.[3] ? num(view[3]) : Number.isFinite(zParam) ? zParam : undefined;

  // The pin of a place: `…!3d52.5162746!4d13.3777041…` in the data segment.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(whole);
  if (pin) return checked(num(pin[1]), num(pin[2]), zoom);

  // A route carries a position for every stop, `!1d<lng>!2d<lat>` in the
  // order they were given, and the last stop is the place being gone to.
  // Only on a route: an embed's `pb` has a `!1d` of its own, and it is a
  // distance.
  if (kind === "dir") {
    const stops = [...whole.matchAll(/!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g)];
    const last = stops[stops.length - 1];
    if (last) return checked(num(last[2]), num(last[1]), zoom);
  }

  const asked = pairParam(url, "q", "query", "ll", "center", "destination", "daddr");
  if (asked) return checked(asked.lat, asked.lng, zoom);

  // `/maps/search/52.5163,+13.3777` and `/maps/place/52°30'58.7"N+13°22'39.7"E/…`.
  // A place or a search names the place first; a route names where it ends
  // last.
  const segments = kind
    ? path.slice(`/maps/${kind}/`.length).split("/").filter((s) => s && !s.startsWith("@") && !s.startsWith("data="))
    : [];
  const segment = kind === "dir" ? segments[segments.length - 1] : segments[0];
  const named = segment ? readPair(segment) : null;
  if (named) return checked(named.lat, named.lng, zoom);

  if (view) return checked(num(view[1]), num(view[2]), zoom, kind !== undefined);

  // The `pb` of an embed writes the centre the other way round: `!2d<lng>!3d<lat>`.
  const embed = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/.exec(whole);
  if (embed) return checked(num(embed[2]), num(embed[1]), zoom);

  if (url.searchParams.get("q") || url.searchParams.get("query") || segment) return fail(PLACE_NAME);
  return fail(NO_POSITION);
}

// Apple Maps ------------------------------------------------------------------

function fromApple(url: URL): MapLocationResult {
  const zParam = num(url.searchParams.get("z"));
  const zoom = Number.isFinite(zParam) ? zParam : undefined;
  const pair = pairParam(url, "coordinate", "ll", "q", "sll", "center");
  if (pair) return checked(pair.lat, pair.lng, zoom);
  return fail(url.searchParams.get("q") || url.searchParams.get("address") ? PLACE_NAME : NO_POSITION);
}

// geo: URIs -------------------------------------------------------------------

/** `geo:52.5163,13.3777?z=16`, which an Android share sheet hands out. */
function fromGeoUri(text: string): MapLocationResult {
  const match = /^geo:([^?;]*)(?:;[^?]*)?(?:\?(.*))?$/i.exec(text.trim());
  if (!match) return fail(UNREADABLE);
  const params = new URLSearchParams(match[2] ?? "");
  const zParam = num(params.get("z"));
  const zoom = Number.isFinite(zParam) ? zParam : undefined;
  const [lat, lng] = match[1].split(",").map(num);
  // `geo:0,0?q=52.5,13.3(Label)` puts the real position in the query, and
  // `geo:0,0?q=Brandenburger+Tor` puts a name there and no position at all.
  const query = params.get("q");
  const queried = query ? readPair(query.replace(/\(.*\)\s*$/, "")) : null;
  if (query && lat === 0 && lng === 0) return queried ? checked(queried.lat, queried.lng, zoom) : fail(PLACE_NAME);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return checked(lat, lng, zoom);
  if (queried) return checked(queried.lat, queried.lng, zoom);
  return fail(UNREADABLE);
}

// ---------------------------------------------------------------------------
// Addresses the block writes
// ---------------------------------------------------------------------------

/*
 * The embedded view is sized for a frame of about 640 by 360 pixels, which is
 * what the block is at its default height in a typical column; the frame is
 * responsive and OpenStreetMap fits the box to whatever size it is given, so
 * this only has to be close. In web mercator a 256-pixel tile spans 360 / 2^z
 * degrees of longitude, and a degree of latitude is 1 / cos(lat) times as
 * tall on screen as a degree of longitude.
 */
const EMBED_WIDTH = 640;
const EMBED_HEIGHT = 360;

/** A coordinate as the links write it: no exponent, no `-0`, no trailing zeros. */
function fixed(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Five decimals is a metre, which is closer than any front door needs. */
const point = (value: number) => fixed(value, 5);

function zoomForSpan(lonSpan: number): number | undefined {
  if (!Number.isFinite(lonSpan) || lonSpan <= 0) return undefined;
  return clampZoom(Math.log2((360 * (EMBED_WIDTH / 256)) / lonSpan));
}

/** The box the embedded map shows: [minLon, minLat, maxLon, maxLat]. */
export function embedBox(lat: number, lng: number, zoom: number): [number, number, number, number] {
  const cLat = Number(point(lat));
  const cLng = Number(point(lng));
  const lonSpan = (360 / 2 ** clampZoom(zoom)) * (EMBED_WIDTH / 256);
  // Near a pole the cosine runs to nothing, and a box with no height is not
  // one OpenStreetMap can fit.
  const latSpan = lonSpan * (EMBED_HEIGHT / EMBED_WIDTH) * Math.max(Math.cos((cLat * Math.PI) / 180), 0.01);
  const round = (v: number) => Number(fixed(v, 6));
  return [
    round(cLng - lonSpan / 2),
    round(Math.max(cLat - latSpan / 2, -90)),
    round(cLng + lonSpan / 2),
    round(Math.min(cLat + latSpan / 2, 90)),
  ];
}

/** The OpenStreetMap frame for a position, with a marker on it. */
export function osmEmbedUrl(lat: number, lng: number, zoom: number): string {
  const box = embedBox(lat, lng, zoom).map((v) => fixed(v, 6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${box}&layer=mapnik&marker=${point(lat)},${point(lng)}`;
}

/** The same place, opened on openstreetmap.org with a marker. */
export function osmLinkUrl(lat: number, lng: number, zoom: number): string {
  const la = point(lat);
  const lo = point(lng);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${clampZoom(zoom)}/${la}/${lo}`;
}

/**
 * The same place on Google Maps, which is where a lot of visitors want to
 * plan the journey. The documented search form, which opens the app on a
 * phone that has it.
 */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${point(lat)}%2C${point(lng)}`;
}

/**
 * The tile servers an OpenStreetMap frame draws its map from, by the layer
 * named in its address.
 *
 * The frame is one request to www.openstreetmap.org; the map inside it is
 * dozens more, to a server that depends on the layer — OpenStreetMap's own
 * for the standard map, OpenStreetMap France for the humanitarian and cycle
 * layers, Thunderforest for the transport and cycle maps — and each of them
 * is handed the visitor's IP address as the page opens. The privacy notice
 * has to name them, so the audit asks here. The hosts are the ones
 * openstreetmap-website's `config/layers.yml` gives for the layers it lets
 * you embed; a layer it does not know falls back to the standard map, and so
 * does this.
 */
const OSM_LAYER_TILE_HOSTS: Record<string, readonly string[]> = {
  mapnik: ["tile.openstreetmap.org"],
  cyclosm: ["a.tile-cyclosm.openstreetmap.fr", "b.tile-cyclosm.openstreetmap.fr", "c.tile-cyclosm.openstreetmap.fr"],
  cyclemap: ["api.thunderforest.com"],
  transportmap: ["api.thunderforest.com"],
  hot: ["tile-a.openstreetmap.fr", "tile-b.openstreetmap.fr", "tile-c.openstreetmap.fr"],
  shortbread: ["vector.openstreetmap.org"],
};

export function osmTileHosts(src: unknown): string[] {
  if (typeof src !== "string" || src.length > 8000) return [];
  let url: URL;
  try {
    url = new URL(src.trim().replace(/&amp;/gi, "&").replace(/^\/\//, "https://"));
  } catch {
    return [];
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "openstreetmap.org" || url.pathname !== "/export/embed.html") return [];
  const layer = (url.searchParams.get("layer") ?? "").split(",")[0].trim().toLowerCase();
  return [...(OSM_LAYER_TILE_HOSTS[layer] ?? OSM_LAYER_TILE_HOSTS.mapnik)];
}

/**
 * Which way round the card's drawing is, from the place's own position.
 *
 * Every map drew the same streets, so two cards on one page — the shop and
 * the warehouse — looked like one card twice. The drawing is mirrored one of
 * four ways instead, picked from the coordinates so the same place always
 * gets the same one and the server and the browser agree about it.
 */
export function drawingVariant(lat: number, lng: number): 0 | 1 | 2 | 3 {
  const a = Math.round((Number.isFinite(lat) ? lat : 0) * 1e4);
  const b = Math.round((Number.isFinite(lng) ? lng : 0) * 1e4);
  const mixed = Math.imul(a ^ Math.imul(b, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return ((mixed >>> 13) & 3) as 0 | 1 | 2 | 3;
}

/**
 * What the links under a map say when the author has not said otherwise. The
 * frame is already a map, so the link under it offers a larger one; under the
 * card it is the first map the visitor sees, so it says where it goes.
 */
export const MAP_LINK_LABELS = {
  card: "Open in OpenStreetMap",
  embed: "Open larger map",
  google: "Open in Google Maps",
} as const;

/**
 * A position as a person reads it: "52.5163° N, 13.3777° E". Four decimals is
 * ten metres, enough to find the door once you are in the street, and short
 * enough to read off a card into a satnav.
 */
export function formatCoordinates(lat: number, lng: number): string {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`;
  return `${part(lat, "N", "S")}, ${part(lng, "E", "W")}`;
}

/**
 * The address as plain text, for an attribute.
 *
 * The address is inline HTML — the author can bold part of it on the canvas —
 * and a frame's `title` is read out as it is written, so `<b>` would be read
 * out too. The entities are the handful the sanitiser writes.
 *
 * A tag is `<` up to the next `>` with no other `<` in between. The looser
 * `<[^>]*>` runs to the end of the text from every `<` that is never closed,
 * and the canvas draws this on every keystroke: a hundred thousand of them
 * pasted into the address took seven seconds a render.
 */
export function addressText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^<>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
