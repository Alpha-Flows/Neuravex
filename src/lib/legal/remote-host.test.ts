import { describe, it, expect } from "vitest";
import { remoteHost } from "@/lib/legal/audit";

describe("which server an address reaches", () => {
  it("answers for an address on somebody else's server", () => {
    expect(remoteHost("https://images.example/a.jpg")).toBe("images.example");
    expect(remoteHost("http://images.example:8080/a.jpg")).toBe("images.example:8080");
    expect(remoteHost("//fonts.gstatic.com/x.woff2")).toBe("fonts.gstatic.com");
  });

  it("reads a backslash the way a browser does", () => {
    // `/\host` and `\\host` pass the link check as paths — they have no
    // scheme — and a browser fetches both from `host`.
    expect(remoteHost("/\\cdn.example/clip.mp4")).toBe("cdn.example");
    expect(remoteHost("\\\\img.example\\p.jpg")).toBe("img.example");
    expect(remoteHost("\\/img.example/p.jpg")).toBe("img.example");
  });

  it("says nothing for this site's own files", () => {
    for (const local of ["/stock/a.jpg", "/uploads/x.mp3", "about.html", "./a.png", "../b.png", "#top", "?q=1", "data:image/png;base64,xx"]) {
      expect(remoteHost(local), local).toBeNull();
    }
  });

  it("says nothing for an address that is not fetched over the web", () => {
    expect(remoteHost("mailto:a@b.de")).toBeNull();
    expect(remoteHost("tel:+491701234567")).toBeNull();
    expect(remoteHost("javascript:alert(1)")).toBeNull();
    expect(remoteHost("")).toBeNull();
    expect(remoteHost(42)).toBeNull();
  });
});
