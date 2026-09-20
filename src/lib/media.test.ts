import { describe, it, expect } from "vitest";
import { cleanAlt, cleanName, displayName, fileNameFromUrl, matchesQuery, MAX_ALT, MAX_NAME } from "./media";

describe("what an uploaded picture is called", () => {
  it("is the name it arrived with, not the one the disk gave it", () => {
    // An upload is stored under a generated name so two files cannot collide,
    // and the library listed exactly that: a wall of "mu59seflqpe0.png".
    expect(displayName({ url: "/uploads/mu59seflqpe0.png", name: "Café Sunset Hero.png" })).toBe(
      "Café Sunset Hero.png",
    );
  });

  it("falls back to the file for an upload from before the library remembered", () => {
    expect(displayName({ url: "/uploads/mu59seflqpe0.png" })).toBe("mu59seflqpe0.png");
    expect(displayName({ url: "/uploads/mu59seflqpe0.png", name: "   " })).toBe("mu59seflqpe0.png");
  });

  it("keeps a name to one readable line", () => {
    expect(cleanName("  spaced   out  ")).toBe("spaced out");
    expect(cleanName("folder/photo.png")).toBe("folder photo.png");
    expect(cleanName("two\nlines")).toBe("two lines");
    expect(cleanName("x".repeat(400)).length).toBe(MAX_NAME);
    expect(cleanAlt("y".repeat(400)).length).toBe(MAX_ALT);
  });

  it("knows the file behind a URL", () => {
    expect(fileNameFromUrl("/uploads/mu59seflqpe0.png")).toBe("mu59seflqpe0.png");
    expect(fileNameFromUrl("/stock/nature/lake.jpg")).toBe("lake.jpg");
  });
});

describe("searching the picture library", () => {
  const picture = { name: "Harbour at dusk", alt: "Boats moored in a harbour as the sun goes down" };

  it("matches a name or what the picture shows", () => {
    expect(matchesQuery("harbour", [picture.name, picture.alt])).toBe(true);
    expect(matchesQuery("boats", [picture.name, picture.alt])).toBe(true);
    expect(matchesQuery("mountain", [picture.name, picture.alt])).toBe(false);
  });

  it("takes the words in any order, as anyone typing two of them would", () => {
    expect(matchesQuery("dusk boats", [picture.name, picture.alt])).toBe(true);
    expect(matchesQuery("boats dusk", [picture.name, picture.alt])).toBe(true);
    expect(matchesQuery("dusk mountain", [picture.name, picture.alt])).toBe(false);
  });

  it("folds accents on both sides, so a plain keyboard finds an accented name", () => {
    expect(matchesQuery("cafe", ["Café Noir"])).toBe(true);
    expect(matchesQuery("café", ["Cafe Noir"])).toBe(true);
    expect(matchesQuery("strasse", ["Weißbier Straße"])).toBe(true);
  });

  it("shows everything when the box is empty", () => {
    expect(matchesQuery("", [picture.name])).toBe(true);
    expect(matchesQuery("   ", [picture.name])).toBe(true);
  });

  it("ignores a field that is not there", () => {
    expect(matchesQuery("harbour", [undefined, null, picture.alt])).toBe(true);
    expect(matchesQuery("harbour", [undefined, null])).toBe(false);
  });
});
