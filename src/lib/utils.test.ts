import { describe, it, expect } from "vitest";
import { slugify } from "./utils";

describe("the address a site or page is published at", () => {
  it("keeps the letters of a name that carries accents", () => {
    // A site called "Résumé" was published at /sites/r-sum, and "Crème Brûlée"
    // at /cr-me-br-l-e: every accented letter was thrown out with its accent,
    // and the customer's own name for their site came back as rubble.
    expect(slugify("Résumé")).toBe("resume");
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
    expect(slugify("Café Noir")).toBe("cafe-noir");
    expect(slugify("Björk Design")).toBe("bjork-design");
    expect(slugify("Ñandú")).toBe("nandu");
    expect(slugify("naïve")).toBe("naive");
  });

  it("keeps the sound of a letter that has no accent to remove", () => {
    // Splitting a letter apart only helps where there is an accent to drop.
    // Ø, ß and Æ are letters in their own right, so they need saying as words.
    expect(slugify("Nørrebro Kaffe")).toBe("norrebro-kaffe");
    expect(slugify("Weißbier Straße")).toBe("weissbier-strasse");
    expect(slugify("Ængland")).toBe("aengland");
    expect(slugify("Łódź")).toBe("lodz");
  });

  it("still makes plain names plain", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("Zoë's Bakery")).toBe("zoes-bakery");
    expect(slugify("  Spaced  Out  ")).toBe("spaced-out");
    expect(slugify("About / Us")).toBe("about-us");
  });

  it("never ends on a stray dash, however long the name", () => {
    // Cutting a long name to length used to be able to land on a separator,
    // leaving an address like /my-very-long-name-.
    const cut = slugify(`${"a".repeat(63)} and then some more`);
    expect(cut.endsWith("-")).toBe(false);
    expect(cut.length).toBeLessThanOrEqual(64);
  });

  it("falls back rather than returning an empty address", () => {
    // A name written in a script with no Latin letters still has to go
    // somewhere: the slug is editable in Settings, and a blank one is not.
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("日本語のサイト")).toBe("untitled");
  });
});
