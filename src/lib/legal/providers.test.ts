import { describe, it, expect } from "vitest";
import type { BaseBlock } from "@/types";
import { buildDatenschutz } from "./datenschutz";
import { emptyProfile, type LegalProfile } from "./profile";
import { DEFAULT_LOOK } from "../page-starters";
import { sanitizeHtml } from "../sanitize";
import { videoEmbed } from "../video-embed";

function text(blocks: BaseBlock[]): string {
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
}

const profile = (): LegalProfile => ({
  ...emptyProfile(),
  legalForm: "gmbh",
  companyName: "Muster GmbH",
  representatives: ["Erika Mustermann"],
  address: { street: "Musterstraße 1", extra: "", postalCode: "10115", city: "Berlin", country: "Deutschland" },
  email: "kontakt@muster.de",
  registerKind: "hrb",
  registerCourt: "Amtsgericht Berlin-Charlottenburg",
  registerNumber: "HRB 123456",
  hostingProvider: "Hetzner Online GmbH",
  hostingDpa: "yes",
  formFate: "builder",
  formRetention: "bis zur abschließenden Bearbeitung",
});

const notice = (remoteHosts: string[]) =>
  text(buildDatenschutz(profile(), { findings: [], hasForm: false, remoteHosts, linkHosts: [], selfContained: remoteHosts.length === 0 }, DEFAULT_LOOK));

describe("the services the builder's own blocks embed", () => {
  it("are named with their provider, not only by host", () => {
    const out = notice(["www.youtube-nocookie.com", "player.vimeo.com", "www.openstreetmap.org", "tile.openstreetmap.org"]);
    expect(out).toContain("Google Ireland Limited");
    expect(out).toContain("Vimeo.com, Inc.");
    expect(out).toContain("OpenStreetMap Foundation");
    // The host names are still listed, as for any other third party.
    expect(out).toContain("www.youtube-nocookie.com");
  });

  it("are only described when the site uses them", () => {
    const out = notice(["fonts.example.net"]);
    expect(out).toContain("fonts.example.net");
    expect(out).not.toContain("Google Ireland");
    expect(out).not.toContain("Vimeo.com");
    expect(out).not.toContain("OpenStreetMap Foundation");
  });

  it("describe a map once, whichever of its hosts is found", () => {
    const out = notice(["tile.openstreetmap.org", "www.openstreetmap.org"]);
    expect(out.split("OpenStreetMap Foundation").length - 1).toBe(1);
  });
});

describe("what the notice says about Vimeo", () => {
  // The notice says the player is asked not to track, for every Vimeo frame
  // the audit finds — so every frame has to ask, not only the video block's.
  it("is true of a frame pasted into Custom HTML", () => {
    const pasted = '<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e&badge=0"></iframe>';
    const src = /src="([^"]+)"/.exec(sanitizeHtml(pasted))?.[1] ?? "";
    expect(new URL(src.replace(/&amp;/g, "&")).searchParams.get("dnt")).toBe("1");
  });

  it("is true of the video block's own player", () => {
    const embed = videoEmbed("https://vimeo.com/76979871");
    expect(embed && new URL(embed.embedUrl).searchParams.get("dnt")).toBe("1");
  });

  it("does not grow with every save", () => {
    const once = sanitizeHtml('<iframe src="https://player.vimeo.com/video/1?dnt=0"></iframe>');
    expect(sanitizeHtml(once)).toBe(once);
    expect(once.match(/dnt=/g)).toHaveLength(1);
    expect(once).toContain("dnt=1");
  });
});
