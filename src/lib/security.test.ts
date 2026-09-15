import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  hashPassword,
  verifyPasswordHash,
  sanitizeCss,
  sanitizeCssValue,
  safeRedirectUrl,
  validateUploadFile,
  isDangerousExtension,
  sanitizeSvg,
} from "@/lib/security";

describe("createSessionToken / verifySessionToken", () => {
  it("verifies a freshly created token and returns the bound userId", () => {
    const token = createSessionToken("user-123");
    expect(verifySessionToken(token)).toEqual({ valid: true, userId: "user-123" });
  });

  it("produces unique tokens on each call", () => {
    expect(createSessionToken("user-123")).not.toBe(createSessionToken("user-123"));
  });

  it("rejects a token with a tampered signature", () => {
    const [userId, nonce] = createSessionToken("user-123").split(".");
    const forged = `${userId}.${nonce}.${"0".repeat(64)}`;
    expect(verifySessionToken(forged)).toEqual({ valid: false, userId: null });
  });

  it("rejects a token with a tampered nonce", () => {
    const [userId, , sig] = createSessionToken("user-123").split(".");
    const forged = `${userId}.${"a".repeat(64)}.${sig}`;
    expect(verifySessionToken(forged)).toEqual({ valid: false, userId: null });
  });

  it("rejects a token whose userId was swapped for another valid-looking one", () => {
    const [, nonce, sig] = createSessionToken("user-123").split(".");
    const forged = `user-456.${nonce}.${sig}`;
    expect(verifySessionToken(forged)).toEqual({ valid: false, userId: null });
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("")).toEqual({ valid: false, userId: null });
    expect(verifySessionToken("no-dots-here")).toEqual({ valid: false, userId: null });
    expect(verifySessionToken("a.b")).toEqual({ valid: false, userId: null });
    expect(verifySessionToken("a.b.c.d")).toEqual({ valid: false, userId: null });
    expect(verifySessionToken("..")).toEqual({ valid: false, userId: null });
    expect(verifySessionToken("abc..")).toEqual({ valid: false, userId: null });
    expect(verifySessionToken("..xyz")).toEqual({ valid: false, userId: null });
  });

  it("rejects a signature that is not valid hex", () => {
    const [userId, nonce] = createSessionToken("user-123").split(".");
    expect(verifySessionToken(`${userId}.${nonce}.not-hex!!`)).toEqual({ valid: false, userId: null });
  });

  it("does not throw on garbage input", () => {
    expect(() => verifySessionToken("💥.💥.💥")).not.toThrow();
  });
});

describe("hashPassword / verifyPasswordHash", () => {
  it("verifies a password against its own hash", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPasswordHash("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPasswordHash("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    expect(hashPassword("same-password")).not.toBe(hashPassword("same-password"));
  });

  it("stores salt and hash separated by a colon", () => {
    const hash = hashPassword("x");
    expect(hash.split(":")).toHaveLength(2);
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(() => verifyPasswordHash("anything", "not-a-valid-hash")).not.toThrow();
    expect(verifyPasswordHash("anything", "not-a-valid-hash")).toBe(false);
    expect(verifyPasswordHash("anything", "")).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("accepts a matching password", () => {
    expect(verifyPassword("correct-horse", "correct-horse")).toBe(true);
  });

  it("rejects a non-matching password", () => {
    expect(verifyPassword("wrong", "correct-horse")).toBe(false);
  });

  it("rejects a password differing only in length", () => {
    expect(verifyPassword("correct-horse-extra", "correct-horse")).toBe(false);
  });

  it("rejects empty input against a real password", () => {
    expect(verifyPassword("", "correct-horse")).toBe(false);
  });

  it("treats two empty strings as equal", () => {
    expect(verifyPassword("", "")).toBe(true);
  });

  it("is case sensitive", () => {
    expect(verifyPassword("Password", "password")).toBe(false);
  });
});

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

describe("safeRedirectUrl", () => {
  it("allows a relative path", () => {
    expect(safeRedirectUrl("/admin/sites")).toBe("/admin/sites");
  });

  it("falls back for an empty url", () => {
    expect(safeRedirectUrl("")).toBe("/");
  });

  it("rejects protocol-relative urls (open redirect)", () => {
    expect(safeRedirectUrl("//evil.example")).toBe("/");
  });

  it("rejects absolute http(s) urls", () => {
    expect(safeRedirectUrl("https://evil.example")).toBe("/");
    expect(safeRedirectUrl("http://evil.example")).toBe("/");
  });

  it("rejects javascript: urls", () => {
    expect(safeRedirectUrl("javascript:alert(1)")).toBe("/");
  });

  it("rejects a path not starting with /", () => {
    expect(safeRedirectUrl("admin/sites")).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(safeRedirectUrl("//evil.example", "/login")).toBe("/login");
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
    const svg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#f00"/></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });
});
