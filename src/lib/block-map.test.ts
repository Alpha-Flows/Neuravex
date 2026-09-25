import { describe, it, expect } from "vitest";
import { normalizeBlockTree } from "@/lib/block-tree";
import { BLOCKS } from "@/lib/blocks";
import { EMBED_HOSTS, EMBED_ORIGINS, isAllowedEmbed, normalizeEmbed } from "@/lib/embed-hosts";
import { sanitizeHtml } from "@/lib/sanitize";
import { contentSecurityPolicy } from "@/proxy";
import { auditSite } from "@/lib/legal/audit";
import { buildDatenschutz } from "@/lib/legal/datenschutz";
import { emptyProfile } from "@/lib/legal/profile";
import { DEFAULT_LOOK } from "@/lib/page-starters";
import { editedText, plainText } from "@/lib/inline-text";
import type { BaseBlock, MapProps } from "@/types";
import {
  MAP_LINK_LABELS,
  addressText,
  decodeOsmShortLink,
  drawingVariant,
  embedBox,
  formatCoordinates,
  googleMapsUrl,
  osmEmbedUrl,
  osmLinkUrl,
  osmTileHosts,
  parseMapLocation,
  readPair,
  type MapLocation,
} from "@/lib/map-location";

const BERLIN = { lat: 52.5163, lng: 13.3777 };

/** The position read from a paste, or a failed test naming the reason. */
function located(input: string): MapLocation {
  const result = parseMapLocation(input);
  if (!result.ok) throw new Error(`${input} → ${result.reason}`);
  return result.location;
}

function refused(input: string): string {
  const result = parseMapLocation(input);
  if (result.ok) throw new Error(`${input} was read as ${JSON.stringify(result.location)}`);
  return result.reason;
}

function near(location: MapLocation, lat: number, lng: number, within = 1e-6) {
  expect(Math.abs(location.lat - lat), `lat ${location.lat}`).toBeLessThan(within);
  expect(Math.abs(location.lng - lng), `lng ${location.lng}`).toBeLessThan(within);
}

describe("coordinates, as people paste them", () => {
  it("reads latitude then longitude, separated by a comma, a semicolon or a space", () => {
    for (const input of ["52.5163, 13.3777", "52.5163,13.3777", "52.5163; 13.3777", "52.5163 13.3777", "  52.5163\t13.3777 ", "(52.5163, 13.3777)"]) {
      near(located(input), BERLIN.lat, BERLIN.lng);
    }
  });

  it("leaves the zoom alone, because plain coordinates do not carry one", () => {
    expect(located("52.5163, 13.3777").zoom).toBeUndefined();
  });

  it("reads the southern and western hemispheres from a minus sign", () => {
    near(located("-33.8688, 151.2093"), -33.8688, 151.2093);
    near(located("40.6892, -74.0445"), 40.6892, -74.0445);
    near(located("−22.9519 −43.2105"), -22.9519, -43.2105);
  });

  it("reads hemisphere letters before or after, in either order, and O for Ost", () => {
    near(located("52.5163° N, 13.3777° E"), BERLIN.lat, BERLIN.lng);
    near(located("52.5163N 13.3777E"), BERLIN.lat, BERLIN.lng);
    near(located("N 52.5163, E 13.3777"), BERLIN.lat, BERLIN.lng);
    near(located("13.3777° E, 52.5163° N"), BERLIN.lat, BERLIN.lng);
    near(located("33.8688° S, 151.2093° E"), -33.8688, 151.2093);
    near(located("40.6892 N 74.0445 W"), 40.6892, -74.0445);
    near(located("52.5163° N, 13.3777° O"), BERLIN.lat, BERLIN.lng);
  });

  it("reads degrees, minutes and seconds, with the quotes a page or a keyboard gives them", () => {
    const expected = { lat: 52 + 30 / 60 + 58.7 / 3600, lng: 13 + 22 / 60 + 39.7 / 3600 };
    near(located(`52°30'58.7"N 13°22'39.7"E`), expected.lat, expected.lng);
    near(located("52°30′58.7″N 13°22′39.7″E"), expected.lat, expected.lng);
    near(located("52° 30' 58.7'' N, 13° 22' 39.7'' E"), expected.lat, expected.lng);
    near(located("52°30'N 13°22'E"), 52.5, 13 + 22 / 60);
  });

  it("reads a decimal comma where it cannot be a separator", () => {
    near(located("52,5163 13,3777"), BERLIN.lat, BERLIN.lng);
    near(located("52,5163; 13,3777"), BERLIN.lat, BERLIN.lng);
    near(located("52,5163° N 13,3777° O"), BERLIN.lat, BERLIN.lng);
  });

  it("refuses what is not a position, and says what one looks like", () => {
    for (const input of ["", "   ", "hello", "Pariser Platz 1, 10117 Berlin", "52.5163", "1, 2, 3", "52.5.1, 13", "52°30", "52.5163-13.3777", "52,5163, 13,3777"]) {
      expect(refused(input), input).toMatch(/52\.5163, 13\.3777|Paste a link/);
    }
    expect(parseMapLocation(undefined).ok).toBe(false);
    expect(parseMapLocation(42).ok).toBe(false);
  });

  it("refuses a hemisphere given twice, or given alongside a minus sign", () => {
    refused("52 N, 13 N");
    refused("-52 S, 13 E");
    refused("52°75'N 13°E");
  });

  it("refuses a position off the globe, and says latitude comes first", () => {
    for (const input of ["91, 13", "-90.5, 13", "52, 181", "52, -180.01", "181 N, 13 E", "13.3777, 152.5, "]) {
      const result = parseMapLocation(input);
      expect(result.ok, input).toBe(false);
    }
    expect(refused("91, 13")).toMatch(/between -90 and 90/);
    expect(refused("152.5, 13.37")).toMatch(/latitude first/);
  });

  it("does not choke on a paste the size of a page", () => {
    expect(parseMapLocation("5".repeat(100_000)).ok).toBe(false);
  });

  it("stays fast on long runs of spaces and brackets", () => {
    // `readPair` used to trim before it measured, and two of its patterns
    // retried from every space in a long run.
    const inputs = [
      " ".repeat(100_000) + "52.5, 13.3",
      "(" + " ".repeat(100_000),
      " ".repeat(100_000) + ")",
      "52.5" + " ".repeat(190) + "x",
      "loc:" + " ".repeat(190) + "(",
      "52" + " ".repeat(7990) + "13",
    ];
    for (const input of inputs) {
      const started = performance.now();
      readPair(input);
      parseMapLocation(input);
      expect(performance.now() - started, JSON.stringify(input.slice(0, 12))).toBeLessThan(250);
    }
    expect(readPair(" ".repeat(300) + "52.5, 13.3")).toBeNull();
    expect(readPair("  (52.5163, 13.3777)  ")).toEqual({ lat: 52.5163, lng: 13.3777 });
  });
});

describe("OpenStreetMap links", () => {
  it("reads the view from the fragment", () => {
    const at = located("https://www.openstreetmap.org/#map=16/52.51630/13.37770");
    near(at, BERLIN.lat, BERLIN.lng);
    expect(at.zoom).toBe(16);
    expect(located("https://www.openstreetmap.org/#map=17/52.51630/13.37770&layers=C").zoom).toBe(17);
  });

  it("prefers the marker to the view around it", () => {
    const at = located("https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=12/52.4/13.2");
    near(at, BERLIN.lat, BERLIN.lng);
    expect(at.zoom).toBe(12);
  });

  it("reads a search from its view, or from its query when that is coordinates", () => {
    const named = located("https://www.openstreetmap.org/search?query=Brandenburger%20Tor#map=18/52.51627/13.37770");
    near(named, 52.51627, 13.3777);
    expect(named.zoom).toBe(18);
    // Where the map was when the name was searched for, not the result.
    expect(named.centreOnly).toBe(true);
    const coords = located("https://www.openstreetmap.org/search?query=52.5163%2C13.3777#map=5/51/10");
    near(coords, BERLIN.lat, BERLIN.lng);
    expect(coords.centreOnly).toBeUndefined();
    expect(refused("https://www.openstreetmap.org/search?query=Brandenburger%20Tor")).toMatch(/search for a name/);
  });

  it("reads an object page by its view, and asks for more when it has none", () => {
    near(located("https://www.openstreetmap.org/way/518071791#map=19/52.51627/13.37770"), 52.51627, 13.3777);
    expect(refused("https://www.openstreetmap.org/way/518071791")).toMatch(/does not say where/);
  });

  it("reads the frame and the anchor that OpenStreetMap's share dialog hands out", () => {
    const shared =
      '<iframe width="425" height="350" src="https://www.openstreetmap.org/export/embed.html?bbox=13.3700%2C52.5130%2C13.3850%2C52.5200&amp;layer=mapnik&amp;marker=52.5163%2C13.3777" style="border: 1px solid black"></iframe>' +
      '<br/><small><a href="https://www.openstreetmap.org/?mlat=52.5163&amp;mlon=13.3777#map=16/52.5163/13.3777">View Larger Map</a></small>';
    const at = located(shared);
    near(at, BERLIN.lat, BERLIN.lng);
    expect(at.zoom).toBeGreaterThanOrEqual(15);
    expect(at.zoom).toBeLessThanOrEqual(17);
  });

  it("reads the old permalinks, openstreetmap.de's, and a link typed without https://", () => {
    const old = located("https://www.openstreetmap.org/?lat=52.5163&lon=13.3777&zoom=15");
    near(old, BERLIN.lat, BERLIN.lng);
    expect(old.zoom).toBe(15);
    near(located("https://www.openstreetmap.de/karte/?zoom=16&lat=52.5163&lon=13.3777"), BERLIN.lat, BERLIN.lng);
    near(located("www.openstreetmap.org/#map=16/52.5163/13.3777"), BERLIN.lat, BERLIN.lng);
    near(located("openstreetmap.org/#map=16/52.5163/13.3777"), BERLIN.lat, BERLIN.lng);
  });

  /*
   * The encoder from openstreetmap-website's `ShortLink.encode`, written out
   * here so the decoder is checked against the algorithm that makes the links
   * rather than against itself. 32-bit numbers, so BigInt for the interleave.
   */
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~";
  function encode(lon: number, lat: number, z: number): string {
    const x = BigInt(Math.floor(((lon + 180) * 2 ** 32) / 360));
    const y = BigInt(Math.floor(((lat + 90) * 2 ** 32) / 180));
    let code = BigInt(0);
    for (let i = 31; i >= 0; i--) {
      code = (code << BigInt(1)) | ((x >> BigInt(i)) & BigInt(1));
      code = (code << BigInt(1)) | ((y >> BigInt(i)) & BigInt(1));
    }
    let str = "";
    for (let i = 0; i < Math.ceil((z + 8) / 3); i++) {
      str += ALPHABET[Number((code >> BigInt(58 - 6 * i)) & BigInt(0x3f))];
    }
    return str + "-".repeat((z + 8) % 3);
  }

  it("decodes OpenStreetMap's own short links without asking anybody", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const lat = random() * 170 - 85;
      const lon = random() * 360 - 180;
      const zoom = 1 + Math.floor(random() * 18);
      const decoded = decodeOsmShortLink(encode(lon, lat, zoom));
      expect(decoded, `${lat},${lon},${zoom}`).not.toBeNull();
      expect(decoded!.zoom).toBe(zoom);
      // The quantisation OpenStreetMap's own test allows: about a pixel.
      const allowed = (360 / 2 ** (zoom + 8)) * 0.5 * Math.sqrt(5);
      expect(Math.hypot(decoded!.lat - lat, decoded!.lng - lon)).toBeLessThan(allowed);
    }
    const at = located(`https://osm.org/go/${encode(BERLIN.lng, BERLIN.lat, 16)}?m=`);
    near(at, BERLIN.lat, BERLIN.lng, 1e-4);
    expect(at.zoom).toBe(16);
  });

  it("reads the old `@` in a short link as the `~` that replaced it", () => {
    expect(decodeOsmShortLink("@v2juONc--")).toEqual(decodeOsmShortLink("~v2juONc--"));
    expect(decodeOsmShortLink("D@hV--")).toEqual(decodeOsmShortLink("D~hV--"));
    expect(decodeOsmShortLink("ab-c")).toBeNull();
    expect(decodeOsmShortLink("")).toBeNull();
  });
});

describe("Google Maps links", () => {
  it("reads the view and its zoom", () => {
    const at = located("https://www.google.com/maps/@52.5163,13.3777,17z");
    near(at, BERLIN.lat, BERLIN.lng);
    expect(at.zoom).toBe(17);
    expect(located("https://www.google.de/maps/@52.5163,13.3777,15.5z").zoom).toBe(16);
  });

  it("prefers the place's pin to the centre of the view it was shared from", () => {
    const at = located(
      "https://www.google.com/maps/place/Brandenburger+Tor/@52.5162746,13.3755154,17z/data=!3m1!4b1!4m6!3m5!1s0x47a851c655f20989:0x26bbfb4e84674c63!8m2!3d52.5162746!4d13.3777041!16zL20vMGRqN24",
    );
    near(at, 52.5162746, 13.3777041);
    expect(at.zoom).toBe(17);
    expect(at.centreOnly).toBeUndefined();
  });

  it("reads a route's destination, not the view it was shared from", () => {
    const route = located(
      "https://www.google.com/maps/dir/Alexanderplatz,+Berlin/Brandenburger+Tor,+Pariser+Platz,+10117+Berlin/@52.5185,13.395,15z/data=!3m1!4b1!4m14!4m13!1m5!1m1!1s0x47a84e1f:0x1!2m2!1d13.4132!2d52.5219!1m5!1m1!1s0x47a851c6:0x2!2m2!1d13.3777!2d52.5163!3e2",
    );
    near(route, BERLIN.lat, BERLIN.lng);
    expect(route.centreOnly).toBeUndefined();
    near(located("https://www.google.com/maps/dir/52.52,13.41/52.5163,13.3777/@52.5185,13.395,15z"), BERLIN.lat, BERLIN.lng);
  });

  it("says when a place, a search or a route only gave the centre of the view", () => {
    for (const link of [
      "https://www.google.com/maps/place/Brandenburger+Tor/@52.5162746,13.3755154,17z",
      "https://www.google.com/maps/search/Brandenburger+Tor/@52.5162746,13.3755154,17z",
      "https://www.google.com/maps/dir/Alexanderplatz/Brandenburger+Tor/@52.5162746,13.3755154,15z",
    ]) {
      const at = located(link);
      near(at, 52.5162746, 13.3755154);
      expect(at.centreOnly, link).toBe(true);
    }
    // A bare view is exactly what was shared.
    expect(located("https://www.google.com/maps/@52.5163,13.3777,17z").centreOnly).toBeUndefined();
  });

  it("reads q, query and ll, including the loc: form and a labelled pin", () => {
    near(located("https://www.google.com/maps?q=52.5163,13.3777"), BERLIN.lat, BERLIN.lng);
    near(located("https://maps.google.com/?q=loc:52.5163,13.3777"), BERLIN.lat, BERLIN.lng);
    near(located("https://www.google.com/maps/search/?api=1&query=52.5163%2C13.3777"), BERLIN.lat, BERLIN.lng);
    const ll = located("https://maps.google.de/maps?ll=52.5163,13.3777&z=14");
    near(ll, BERLIN.lat, BERLIN.lng);
    expect(ll.zoom).toBe(14);
    near(located("https://maps.google.com/maps?q=52.5163,13.3777(Our+shop)"), BERLIN.lat, BERLIN.lng);
  });

  it("reads coordinates written into the path", () => {
    near(located("https://www.google.com/maps/search/52.5163,+13.3777"), BERLIN.lat, BERLIN.lng);
    near(
      located(`https://www.google.com/maps/place/52%C2%B030'58.7%22N+13%C2%B022'39.7%22E`),
      52 + 30 / 60 + 58.7 / 3600,
      13 + 22 / 60 + 39.7 / 3600,
    );
  });

  it("reads the centre of Google's embed code, which writes longitude first", () => {
    const code =
      '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2428.4!2d13.3777!3d52.5163!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sde!2sde!4v1" width="600" height="450"></iframe>';
    near(located(code), BERLIN.lat, BERLIN.lng);
  });

  it("clamps a zoom closer than OpenStreetMap goes", () => {
    expect(located("https://www.google.com/maps/@52.5163,13.3777,21z").zoom).toBe(19);
  });

  it("says why a place name alone is not enough, and what to paste instead", () => {
    expect(refused("https://www.google.com/maps/place/Brandenburger+Tor")).toMatch(/names the place/);
    expect(refused("https://www.google.com/maps?q=Brandenburger+Tor")).toMatch(/right-click the pin/);
  });

  it("never follows a short link, and says so", () => {
    for (const link of ["https://maps.app.goo.gl/AbCdEf123", "https://goo.gl/maps/AbCdEf", "https://g.co/kgs/AbC"]) {
      expect(refused(link), link).toMatch(/short link/);
    }
    expect(refused("maps.app.goo.gl/AbCdEf123")).toMatch(/short link \(maps\.app\.goo\.gl\)/);
  });

  it("refuses a Google address that is not a map, and hosts that only look like Google", () => {
    expect(refused("https://www.google.com/search?q=52.5163,13.3777")).toMatch(/not a map link/);
    expect(refused("https://google.com.evil.example/maps/@52.5163,13.3777,17z")).toMatch(/not a map link/);
    expect(refused("https://example.com/?q=52.5163,13.3777")).toMatch(/not a map link/);
  });
});

describe("other ways a position arrives", () => {
  it("reads Apple Maps and geo: links", () => {
    near(located("https://maps.apple.com/?ll=52.5163,13.3777&q=Brandenburger%20Tor"), BERLIN.lat, BERLIN.lng);
    near(located("https://maps.apple.com/place?coordinate=52.5163,13.3777&name=Tor"), BERLIN.lat, BERLIN.lng);
    const geo = located("geo:52.5163,13.3777?z=16");
    near(geo, BERLIN.lat, BERLIN.lng);
    expect(geo.zoom).toBe(16);
    near(located("geo:0,0?q=52.5163,13.3777(Our shop)"), BERLIN.lat, BERLIN.lng);
    expect(refused("geo:0,0?q=Brandenburger+Tor")).toMatch(/names the place/);
    expect(parseMapLocation("geo:91,13").ok).toBe(false);
  });
});

describe("the addresses the block writes", () => {
  it("builds the frame the brief describes, and nothing else", () => {
    expect(osmEmbedUrl(BERLIN.lat, BERLIN.lng, 16)).toMatch(
      /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+&layer=mapnik&marker=52\.5163,13\.3777$/,
    );
  });

  it("centres the box on the marker, wider than it is tall, and halves it with each zoom", () => {
    for (const [lat, lng] of [[52.5163, 13.3777], [-33.8688, 151.2093], [0, 0], [64.1466, -21.9426]]) {
      for (const zoom of [3, 10, 16, 19]) {
        const [minLon, minLat, maxLon, maxLat] = embedBox(lat, lng, zoom);
        expect(minLon).toBeLessThan(lng);
        expect(maxLon).toBeGreaterThan(lng);
        expect(minLat).toBeLessThan(lat);
        expect(maxLat).toBeGreaterThan(lat);
        expect(Math.abs((minLon + maxLon) / 2 - lng)).toBeLessThan(2e-6);
        expect(Math.abs((minLat + maxLat) / 2 - lat)).toBeLessThan(2e-6);
        expect(maxLon - minLon).toBeGreaterThan(maxLat - minLat);
      }
    }
    const span = (zoom: number) => {
      const [minLon, , maxLon] = embedBox(BERLIN.lat, BERLIN.lng, zoom);
      return maxLon - minLon;
    };
    expect(span(15) / span(16)).toBeCloseTo(2, 3);
    // 640px across at zoom 16 is about a kilometre of Berlin.
    expect(span(16)).toBeCloseTo(0.0137, 3);
  });

  it("rounds what it writes, and never writes an exponent or a minus zero", () => {
    const url = osmEmbedUrl(52.516312345678, 13.377712345678, 16);
    expect(url).toContain("marker=52.51631,13.37771");
    const box = new URL(url).searchParams.get("bbox")!.split(",");
    for (const edge of box) expect(edge).toMatch(/^-?\d+(?:\.\d{1,6})?$/);
    expect(osmLinkUrl(-0.000001, 0.0000001, 16)).toBe("https://www.openstreetmap.org/?mlat=0&mlon=0#map=16/0/0");
  });

  it("is a frame the CSP and the sanitiser both let through, unchanged", () => {
    const url = osmEmbedUrl(BERLIN.lat, BERLIN.lng, 16);
    expect(isAllowedEmbed(url)).toBe(true);
    expect(normalizeEmbed(url)).toBe(url);
  });

  it("links to the same place on openstreetmap.org and on Google Maps", () => {
    expect(osmLinkUrl(BERLIN.lat, BERLIN.lng, 16)).toBe(
      "https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=16/52.5163/13.3777",
    );
    expect(osmLinkUrl(BERLIN.lat, BERLIN.lng, 40)).toContain("#map=19/");
    expect(googleMapsUrl(BERLIN.lat, BERLIN.lng)).toBe(
      "https://www.google.com/maps/search/?api=1&query=52.5163%2C13.3777",
    );
  });

  it("reads back what it writes", () => {
    for (const zoom of [4, 12, 16, 19]) {
      const frame = located(osmEmbedUrl(BERLIN.lat, BERLIN.lng, zoom));
      near(frame, BERLIN.lat, BERLIN.lng);
      expect(frame.zoom).toBe(zoom);
      const link = located(osmLinkUrl(BERLIN.lat, BERLIN.lng, zoom));
      near(link, BERLIN.lat, BERLIN.lng);
      expect(link.zoom).toBe(zoom);
    }
    near(located(googleMapsUrl(-33.8688, 151.2093)), -33.8688, 151.2093);
  });

  it("writes the position and the address as a person reads them", () => {
    expect(formatCoordinates(BERLIN.lat, BERLIN.lng)).toBe("52.5163° N, 13.3777° E");
    expect(formatCoordinates(-33.8688, -70.5)).toBe("33.8688° S, 70.5000° W");
    expect(addressText("<b>Pariser Platz</b><br>10117 Berlin &amp; Co")).toBe("Pariser Platz, 10117 Berlin & Co");
    expect(addressText(undefined)).toBe("");
  });

  it("reads an address in time proportional to its length", () => {
    // `<[^>]*>` ran to the end of the text from every unclosed `<`: a hundred
    // thousand of them took seven seconds a render.
    for (const input of ["<".repeat(100_000), "<a".repeat(50_000), "<" + "x".repeat(100_000)]) {
      const started = performance.now();
      addressText(input);
      expect(performance.now() - started).toBeLessThan(250);
    }
  });
});

describe("the map block at the door", () => {
  const map = (props: object) => {
    const result = normalizeBlockTree([{ id: "m", type: "map", props }]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree).toHaveLength(1);
    return result.tree[0].props as MapProps;
  };
  const defaults = BLOCKS.find((b) => b.type === "map")!.defaultProps as MapProps;

  it("keeps its own defaults exactly as they are", () => {
    expect(map(defaults)).toEqual(defaults);
  });

  it("fills in a block with nothing in it", () => {
    const p = map({});
    expect(p).toMatchObject({ lat: 52.5163, lng: 13.3777, zoom: 16, mode: "card", height: 360, googleLink: true });
    expect(p.address).toBe("");
    expect(p.linkLabel).toBe("");
  });

  it("reads an empty field as nothing, not as zero", () => {
    // `z.coerce.number()` made "" a latitude of 0 — a pin in the sea.
    const p = map({ ...defaults, lat: "", lng: "  ", zoom: "" });
    expect(p.lat).toBe(52.5163);
    expect(p.lng).toBe(13.3777);
    expect(p.zoom).toBe(16);
  });

  it("takes a number written as a string, and rounds it to a tenth of a metre", () => {
    const p = map({ ...defaults, lat: " -33.868812345 ", lng: "151.2093", zoom: "12" });
    expect(p.lat).toBe(-33.868812);
    expect(p.lng).toBe(151.2093);
    expect(p.zoom).toBe(12);
  });

  it("falls back from a position off the globe, and clamps a zoom or a height", () => {
    const p = map({ ...defaults, lat: 91, lng: -181, zoom: 21, height: 5000 });
    expect(p.lat).toBe(52.5163);
    expect(p.lng).toBe(13.3777);
    expect(p.zoom).toBe(19);
    expect(p.height).toBe(900);
    expect(map({ ...defaults, zoom: 15.6, height: 20 })).toMatchObject({ zoom: 16, height: 160 });
    expect(map({ ...defaults, lat: Infinity, zoom: NaN, height: "tall" })).toMatchObject({ lat: 52.5163, zoom: 16, height: 360 });
  });

  it("repairs a mode or a switch it does not know", () => {
    expect(map({ ...defaults, mode: "satellite", googleLink: "yes" })).toMatchObject({ mode: "card", googleLink: true });
    expect(map({ ...defaults, googleLink: false }).googleLink).toBe(false);
  });

  it("sanitises the address and the link labels, which are drawn as HTML", () => {
    const p = map({
      ...defaults,
      address: 'Pariser Platz<img src=x onerror="alert(1)"><script>alert(2)</script> <b>1</b>',
      linkLabel: '<iframe src="https://evil.example"></iframe>Karte öffnen',
      googleLabel: '<a href="javascript:alert(1)">Route</a>',
    });
    expect(p.address).not.toMatch(/<img|<script|onerror/i);
    expect(p.address).toContain("<b>1</b>");
    expect(p.linkLabel).toBe("Karte öffnen");
    expect(p.googleLabel).not.toMatch(/javascript:/i);
  });

  it("takes the links out of a link label, which is drawn inside a link", () => {
    // A link inside a link is not HTML: the published page failed to
    // hydrate, and the download split the button in two.
    const p = map({
      ...defaults,
      linkLabel: 'Open <a href="https://example.com/">the <b>map</b></a>',
      googleLabel: '<A HREF="https://example.com/" target="_blank">Route</A> planen',
    });
    expect(p.linkLabel).toBe("Open the <b>map</b>");
    expect(p.googleLabel).toBe("Route planen");
    expect(p.linkLabel + p.googleLabel).not.toMatch(/<a\b/i);
  });

  it("keeps an address typed in the panel exactly as it was typed", () => {
    // Typed straight in as HTML, "<Hinterhaus>" was taken for a tag and lost,
    // and "&" came back into the box as "&amp;".
    const typed = "Hauptstr. 5 <Hinterhaus> & Hof";
    const stored = map({ ...defaults, address: editedText(defaults.address, typed) }).address;
    expect(plainText(stored)).toBe(typed);
    expect(addressText(stored)).toBe(typed);
    // Looking at it in the panel changes nothing.
    const bold = "<b>Pariser Platz</b>, 10117 Berlin";
    expect(editedText(bold, plainText(bold))).toBe(bold);
  });

  it("caps an address and a label at a length a row can hold", () => {
    const p = map({ ...defaults, address: "x".repeat(5000), linkLabel: "y".repeat(5000) });
    expect(p.address.length).toBeLessThanOrEqual(500);
    expect(p.linkLabel.length).toBeLessThanOrEqual(200);
  });

  it("offers a label per mode, so the panel can swap one for the other", () => {
    expect(defaults.linkLabel).toBe(MAP_LINK_LABELS.card);
    expect(MAP_LINK_LABELS.embed).not.toBe(MAP_LINK_LABELS.card);
  });
});

describe("what a map tells the privacy notice", () => {
  const block = (props: Partial<MapProps>): BaseBlock => ({
    id: "m",
    type: "map",
    props: { ...(BLOCKS.find((b) => b.type === "map")!.defaultProps as MapProps), ...props },
  });
  const audit = (b: BaseBlock) => auditSite({ pages: [{ title: "Kontakt", content: JSON.stringify([b]) }] });

  it("finds only links on a card, and no host that is contacted as the page opens", () => {
    const result = audit(block({ mode: "card" }));
    expect(result.findings.every((f) => f.kind === "outbound-link" && !f.needsConsent)).toBe(true);
    expect(result.remoteHosts).toEqual([]);
    expect(result.linkHosts).toEqual(["www.google.com", "www.openstreetmap.org"]);
    expect(result.selfContained).toBe(true);
  });

  it("drops the Google link from the list when the author turned it off", () => {
    expect(audit(block({ mode: "card", googleLink: false })).linkHosts).toEqual(["www.openstreetmap.org"]);
  });

  it("finds an embedded map as an embed that needs consent, and names the tile server it draws from", () => {
    const result = audit(block({ mode: "embed" }));
    const embed = result.findings.find((f) => f.kind === "embed");
    expect(embed).toMatchObject({ host: "www.openstreetmap.org", needsConsent: true, where: "Kontakt" });
    expect(result.remoteHosts).toEqual(["tile.openstreetmap.org", "www.openstreetmap.org"]);
    expect(result.selfContained).toBe(false);
  });

  it("finds a map nested inside a section", () => {
    const section: BaseBlock = { id: "s", type: "section", props: { background: "#0b0f1e" }, children: [block({ mode: "embed" })] };
    expect(audit(section).remoteHosts).toContain("www.openstreetmap.org");
  });

  it("puts an embedded map's hosts into the notice, and a card's into nothing", () => {
    const text = (blocks: BaseBlock[]): string => {
      const out: string[] = [];
      const walk = (list: BaseBlock[]) => {
        for (const b of list) {
          if (typeof b.props?.text === "string") out.push(b.props.text);
          if (Array.isArray(b.props?.items)) out.push(...b.props.items);
          if (b.children) walk(b.children);
        }
      };
      walk(blocks);
      return out.join("\n");
    };
    const embedded = text(buildDatenschutz(emptyProfile(), audit(block({ mode: "embed" })), DEFAULT_LOOK));
    expect(embedded).toContain("Eingebundene Inhalte Dritter");
    expect(embedded).toContain("www.openstreetmap.org");
    expect(embedded).toContain("tile.openstreetmap.org");
    const card = text(buildDatenschutz(emptyProfile(), audit(block({ mode: "card" })), DEFAULT_LOOK));
    expect(card).not.toContain("Eingebundene Inhalte Dritter");
    expect(card).not.toContain("openstreetmap");
  });
});

describe("openstreetmap.org among the embed hosts", () => {
  it("is listed by its www host alone", () => {
    expect(EMBED_HOSTS).toContain("www.openstreetmap.org");
    expect(EMBED_HOSTS).not.toContain("openstreetmap.org");
    expect(EMBED_HOSTS).not.toContain("tile.openstreetmap.org");
    expect(EMBED_ORIGINS).toContain("https://www.openstreetmap.org");
  });

  it("is framed by the published page's CSP", () => {
    const frameSrc = contentSecurityPolicy("abc", false).split("; ").find((d) => d.startsWith("frame-src"));
    expect(frameSrc).toContain("https://www.openstreetmap.org");
  });

  it("survives the sanitiser in a Custom HTML block, and look-alikes do not", () => {
    const url = osmEmbedUrl(BERLIN.lat, BERLIN.lng, 16);
    expect(sanitizeHtml(`<iframe src="${url}"></iframe>`)).toMatch(/<iframe[^>]+openstreetmap\.org\/export\/embed\.html/);
    for (const src of [
      "https://www.openstreetmap.org.evil.example/export/embed.html",
      "https://www.openstreetmap.org@evil.example/",
      "http://www.openstreetmap.org/export/embed.html",
      "https://tile.openstreetmap.org/16/35210/21493.png",
      "https://www.openstreetmap.org/login",
      "https://www.openstreetmap.org/user/someone/account",
      "https://www.openstreetmap.org/oauth2/authorize?client_id=x",
      "https://www.openstreetmap.org/",
      "https://www.openstreetmap.org/export/embed.html/../../login",
    ]) {
      expect(sanitizeHtml(`<iframe src="${src}"></iframe>`), src).not.toMatch(/<iframe/i);
    }
  });

  it("is held to the embeddable map, and the other hosts are not held to a path", () => {
    for (const src of ["https://www.openstreetmap.org/login", "https://www.openstreetmap.org/user/x/account", "https://www.openstreetmap.org/oauth2/authorize"]) {
      expect(normalizeEmbed(src), src).toBeUndefined();
    }
    expect(isAllowedEmbed("https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4&layer=cyclosm")).toBe(true);
    expect(isAllowedEmbed("https://www.youtube-nocookie.com/embed/abc")).toBe(true);
    expect(isAllowedEmbed("https://player.vimeo.com/video/123")).toBe(true);
  });
});

describe("the tile servers behind an OpenStreetMap frame", () => {
  const frame = (layer?: string) =>
    `https://www.openstreetmap.org/export/embed.html?bbox=13.37,52.51,13.38,52.52${layer === undefined ? "" : `&layer=${layer}`}`;

  it("names the server for each layer OpenStreetMap lets you embed", () => {
    expect(osmTileHosts(frame("mapnik"))).toEqual(["tile.openstreetmap.org"]);
    expect(osmTileHosts(frame())).toEqual(["tile.openstreetmap.org"]);
    expect(osmTileHosts(frame("something-new"))).toEqual(["tile.openstreetmap.org"]);
    expect(osmTileHosts(frame("cyclosm"))).toContain("a.tile-cyclosm.openstreetmap.fr");
    expect(osmTileHosts(frame("hot"))).toContain("tile-a.openstreetmap.fr");
    expect(osmTileHosts(frame("transportmap"))).toEqual(["api.thunderforest.com"]);
    expect(osmTileHosts(frame("cyclemap"))).toEqual(["api.thunderforest.com"]);
    expect(osmTileHosts(frame("shortbread"))).toEqual(["vector.openstreetmap.org"]);
    expect(osmTileHosts(frame("cyclosm").replace(/&/g, "&amp;"))).toContain("b.tile-cyclosm.openstreetmap.fr");
    expect(osmTileHosts(osmEmbedUrl(BERLIN.lat, BERLIN.lng, 16))).toEqual(["tile.openstreetmap.org"]);
  });

  it("names nothing for anything that is not an OpenStreetMap frame", () => {
    for (const src of ["https://www.openstreetmap.org/#map=16/52.5/13.3", "https://www.youtube.com/embed/x", "not a url", undefined, 42]) {
      expect(osmTileHosts(src)).toEqual([]);
    }
  });

  const audit = (html: string, where: "page" | "header" = "page") =>
    where === "page"
      ? auditSite({ pages: [{ title: "Anfahrt", content: JSON.stringify([{ id: "h", type: "html", props: { html } }]) }] })
      : auditSite({ pages: [], headerHtml: html });

  it("reports them for a frame pasted into Custom HTML, as it does for the map block", () => {
    const result = audit(`<iframe width="425" height="350" src="${frame("cyclosm").replace(/&/g, "&amp;")}"></iframe>`);
    expect(result.remoteHosts).toContain("www.openstreetmap.org");
    expect(result.remoteHosts).toContain("a.tile-cyclosm.openstreetmap.fr");
    const tiles = result.findings.filter((f) => f.host === "c.tile-cyclosm.openstreetmap.fr");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ needsConsent: true, where: "Anfahrt" });
    expect(audit(`<iframe src="${frame()}"></iframe>`).remoteHosts).toEqual(["tile.openstreetmap.org", "www.openstreetmap.org"]);
  });

  it("reports them for a frame in the site's header or footer", () => {
    const result = audit(`<iframe src="${frame("hot")}"></iframe>`, "header");
    expect(result.remoteHosts).toContain("tile-b.openstreetmap.fr");
    expect(result.findings.find((f) => f.host === "tile-b.openstreetmap.fr")).toMatchObject({ kind: "chrome-remote", where: "Site header" });
  });

  it("reports nothing extra for a link to OpenStreetMap, which loads nothing", () => {
    const result = audit('<a href="https://www.openstreetmap.org/?mlat=52.5&mlon=13.3">Map</a>');
    expect(result.remoteHosts).toEqual([]);
  });
});

describe("the card's drawing", () => {
  it("is mirrored one of four ways, the same way every time for the same place", () => {
    expect(drawingVariant(BERLIN.lat, BERLIN.lng)).toBe(drawingVariant(BERLIN.lat, BERLIN.lng));
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(drawingVariant(48 + i * 0.137, 9 + i * 0.211));
    expect(seen.size).toBe(4);
    expect([0, 1, 2, 3]).toContain(drawingVariant(NaN, Infinity));
  });
});
