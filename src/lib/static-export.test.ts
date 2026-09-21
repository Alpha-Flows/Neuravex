import { describe, it, expect } from "vitest";
import {
  pageFileName,
  stripAppRuntime,
  cleanBodyClasses,
  injectStylesheet,
  rewriteSiteLinks,
  collectLocalAssets,
  rewriteAssetPaths,
  prepareExportedPage,
  injectExportCsp,
  disableExportedForms,
  relativizeSelfUrls,
  relativizeSiteUrls,
} from "@/lib/static-export";

describe("pageFileName", () => {
  it("names the home page index.html whatever its slug", () => {
    expect(pageFileName("anything", true)).toBe("index.html");
  });

  it("names other pages after their slug", () => {
    expect(pageFileName("about", false)).toBe("about.html");
  });

  it("keeps a slug from escaping its folder", () => {
    expect(pageFileName("../../etc/passwd", false)).toBe("etc-passwd.html");
  });

  it("falls back when a slug has nothing usable in it", () => {
    expect(pageFileName("///", false)).toBe("page.html");
  });
});

describe("stripAppRuntime", () => {
  it("removes scripts, including their contents", () => {
    const html = `<body><script>self.__next_f.push([1,"data"])</script><p>Hi</p></body>`;
    expect(stripAppRuntime(html)).toBe("<body><p>Hi</p></body>");
  });

  it("removes Next's stylesheets and preloads but keeps other links", () => {
    const html =
      '<head><link rel="stylesheet" href="/_next/static/css/app.css"/>' +
      '<link rel="preload" as="image" href="https://example.com/a.png"/></head>';
    const out = stripAppRuntime(html);
    expect(out).not.toContain("_next");
    expect(out).toContain("https://example.com/a.png");
  });

  it("removes React's streaming markers", () => {
    expect(stripAppRuntime("<div><!--$--><p>Hi</p><!--/$--></div>")).toBe("<div><p>Hi</p></div>");
  });
});

describe("cleanBodyClasses", () => {
  it("drops the builder's theme classes and keeps the rest", () => {
    const html = '<body class="font-sans antialiased bg-bg text-fg"><p>Hi</p></body>';
    expect(cleanBodyClasses(html)).toBe('<body class="font-sans antialiased"><p>Hi</p></body>');
  });

  it("removes the attribute entirely when nothing is left", () => {
    expect(cleanBodyClasses('<body class="bg-bg text-fg">x</body>')).toBe("<body>x</body>");
  });

  it("leaves a body with no classes alone", () => {
    expect(cleanBodyClasses("<body>x</body>")).toBe("<body>x</body>");
  });
});

describe("rewriteSiteLinks", () => {
  const pages = new Map([
    ["index", "index.html"],
    ["about", "about.html"],
  ]);

  it("points the bare site URL at the home file", () => {
    expect(rewriteSiteLinks('<a href="/sites/demo">Home</a>', "demo", pages)).toBe(
      '<a href="index.html">Home</a>',
    );
  });

  it("points a page URL at its file", () => {
    expect(rewriteSiteLinks('<a href="/sites/demo/about">About</a>', "demo", pages)).toBe(
      '<a href="about.html">About</a>',
    );
  });

  it("leaves a page that is not in this export alone", () => {
    const html = '<a href="/sites/demo/draft">Draft</a>';
    expect(rewriteSiteLinks(html, "demo", pages)).toBe(html);
  });

  it("leaves external links and other sites alone", () => {
    const html = '<a href="https://example.com">Out</a><a href="/sites/other/x">Other</a>';
    expect(rewriteSiteLinks(html, "demo", pages)).toBe(html);
  });
});

describe("collectLocalAssets", () => {
  it("finds images referenced by attribute and by inline background", () => {
    const html =
      '<img src="/uploads/hero.jpg"/><div style="background-image:url(/stock/abstract/a.jpg)"></div>';
    expect(collectLocalAssets(html)).toEqual(["stock/abstract/a.jpg", "uploads/hero.jpg"]);
  });

  it("reports each file once and ignores query strings", () => {
    const html = '<img src="/uploads/a.png"/><img src="/uploads/a.png?v=2"/>';
    expect(collectLocalAssets(html)).toEqual(["uploads/a.png"]);
  });

  it("ignores paths trying to climb out of the public folder", () => {
    expect(collectLocalAssets('<img src="/uploads/../../.env"/>')).toEqual([]);
  });

  it("ignores remote images", () => {
    expect(collectLocalAssets('<img src="https://images.example.com/uploads/x.jpg"/>')).toEqual([]);
  });
});

describe("rewriteAssetPaths", () => {
  it("makes asset URLs relative to the page beside them", () => {
    const html = '<img src="/uploads/a.png"/><div style="background:url(/stock/b.jpg)"></div>';
    expect(rewriteAssetPaths(html)).toBe(
      '<img src="uploads/a.png"/><div style="background:url(stock/b.jpg)"></div>',
    );
  });
});

describe("prepareExportedPage", () => {
  it("produces a page that stands on its own", () => {
    const html =
      '<html><head><link rel="stylesheet" href="/_next/static/css/app.css"/></head>' +
      '<body class="font-sans bg-bg text-fg"><a href="/sites/demo/about">About</a>' +
      '<img src="/uploads/hero.jpg"/><script>hydrate()</script></body></html>';

    const { html: out, assets } = prepareExportedPage(html, {
      siteSlug: "demo",
      pages: new Map([["about", "about.html"]]),
      stylesheetHref: "assets/site.css",
    });

    expect(out).not.toContain("<script");
    expect(out).not.toContain("_next");
    expect(out).toContain('<link rel="stylesheet" href="assets/site.css">');
    expect(out).toContain('href="about.html"');
    expect(out).toContain('src="uploads/hero.jpg"');
    expect(out).toContain('class="font-sans"');
    expect(assets).toEqual(["uploads/hero.jpg"]);
  });
});

describe("injectStylesheet", () => {
  it("adds the link inside head", () => {
    expect(injectStylesheet("<html><head></head><body></body></html>", "a.css")).toBe(
      '<html><head><link rel="stylesheet" href="a.css"></head><body></body></html>',
    );
  });

  it("still adds the link when there is no head", () => {
    expect(injectStylesheet("<p>Hi</p>", "a.css")).toContain('<link rel="stylesheet" href="a.css">');
  });
});

describe("an exported page carries its own policy", () => {
  it("names a script-src of none", () => {
    const out = injectExportCsp("<html><head><title>x</title></head><body></body></html>");
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("script-src 'none'");
    expect(out).toContain("object-src 'none'");
    expect(out).toContain("base-uri 'none'");
  });

  it("still adds it to a fragment with no head", () => {
    expect(injectExportCsp("<p>hi</p>")).toContain("Content-Security-Policy");
  });
});

describe("an exported form cannot send anything", () => {
  it("refuses the submit and says why", () => {
    // With no action and no method, a submit was a GET to the page itself —
    // so every answer landed in the URL, the host's access log and the
    // visitor's history, while the privacy notice said input never left the
    // browser.
    const out = disableExportedForms('<form class="x"><input name="a"></form>');
    expect(out).toContain('onsubmit="return false"');
    expect(out).toContain("cannot send anything");
  });

  it("leaves a form that already handles its own submit alone", () => {
    const html = '<form onsubmit="doThing()"><input></form>';
    expect(disableExportedForms(html)).toBe(html);
  });

  it("does nothing to a page with no form in it", () => {
    const html = "<p>no forms here</p>";
    expect(disableExportedForms(html)).toBe(html);
  });
});

describe("a malformed asset reference is one missing picture, not a 500", () => {
  it("skips a broken percent escape", () => {
    // This used to throw out of decodeURIComponent and turn the whole
    // download into a 500 with no hint which block was responsible.
    expect(() => collectLocalAssets('<img src="/uploads/%ZZ.png">')).not.toThrow();
    expect(collectLocalAssets('<img src="/uploads/%ZZ.png"><img src="/uploads/ok.png">'))
      .toEqual(["uploads/ok.png"]);
  });
});

describe("an absolute URL back at the builder", () => {
  it("becomes relative, so the file is bundled and the link works", () => {
    // No metadataBase means Next writes http://localhost:3939 into og:image,
    // and the asset pattern needs a quote before /uploads — so the file was
    // neither rewritten nor bundled.
    const html = '<meta property="og:image" content="http://localhost:3939/uploads/hero.png">';
    const relative = relativizeSelfUrls(html);
    expect(relative).toContain('content="/uploads/hero.png"');
    expect(collectLocalAssets(relative)).toEqual(["uploads/hero.png"]);
  });
});

describe("an absolute link back at this site's own pages", () => {
  it("becomes a neighbouring file in the download", () => {
    // The published page carries a metadataBase now, so its canonical is
    // absolute — right on the served site, wrong in a downloaded folder,
    // where it pointed at the machine that built it.
    const html = '<link rel="canonical" href="http://127.0.0.1:3939/sites/acme/about"/>';
    const relative = relativizeSiteUrls(html, "acme");
    expect(relative).toContain('href="/sites/acme/about"');
    expect(rewriteSiteLinks(relative, "acme", new Map([["about", "about.html"]])))
      .toContain('href="about.html"');
  });

  it("turns the site root into index.html", () => {
    const html = '<link rel="canonical" href="https://example.com/sites/acme"/>';
    const relative = relativizeSiteUrls(html, "acme");
    expect(rewriteSiteLinks(relative, "acme", new Map())).toContain('href="index.html"');
  });

  it("leaves another instance's site alone", () => {
    const html = '<a href="https://elsewhere.example/sites/other/page">them</a>';
    expect(relativizeSiteUrls(html, "acme")).toBe(html);
  });

  it("does not maul a slug that merely starts the same way", () => {
    const html = '<a href="https://x.example/sites/acme-two/page">x</a>';
    expect(relativizeSiteUrls(html, "acme")).toBe(html);
  });
});
