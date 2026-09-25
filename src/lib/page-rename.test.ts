import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { forwardingPage, EXPORT_CSP } from "@/lib/static-export";

describe("a renamed page's old address", () => {
  it("is left in the download as a page that sends a visitor on, with no script", () => {
    const html = forwardingPage({ to: "about-us.html", title: 'Fish & "chips" <today>', language: "de" });
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=about-us.html">');
    expect(html).toContain('<link rel="canonical" href="about-us.html">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain(EXPORT_CSP);
    expect(html).toContain("<title>Fish &amp; &quot;chips&quot; &lt;today&gt;</title>");
    expect(html).not.toMatch(/<script/i);
  });

  it("is kept by every way a page is renamed, each of which also moves the site's links", () => {
    for (const file of ["src/app/api/pages/[id]/save/route.ts", "src/app/api/pages/[id]/route.ts", "mcp-server.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("freePageSlug(page.siteId,");
      expect(source, file).toContain("afterRename(page, data.slug)");
    }
  });

  it("is forwarded by the published site before a visitor is told it is not found", () => {
    const route = readFileSync("src/app/(published)/sites/[siteSlug]/[[...pageSlug]]/page.tsx", "utf8");
    const forward = route.indexOf("await forwardFormerAddress(site.id, site.slug, pageSlug)");
    expect(forward).toBeGreaterThan(-1);
    expect(forward).toBeLessThan(route.indexOf("if (!page) notFound();"));
  });

  it("is not made out of every pause while an address is being typed", () => {
    const editor = readFileSync("src/components/editor/PageEditor.tsx", "utf8");
    expect(editor).toContain('reason === "manual" || document.activeElement !== slugInputRef.current ? { slug } : {}');
  });
});
