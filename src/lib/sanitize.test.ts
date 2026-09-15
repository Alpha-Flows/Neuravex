import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize";

describe("sanitizeHtml — script & event handler stripping", () => {
  it("removes <script> tags entirely", () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(document.cookie)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain("alert(document.cookie)");
  });

  it("removes onerror handlers on img", () => {
    const out = sanitizeHtml('<img src="x.png" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
  });

  it("removes onclick handlers on any element", () => {
    const out = sanitizeHtml('<div onclick="alert(1)">click me</div>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain("click me");
  });

  it("removes onload handlers", () => {
    const out = sanitizeHtml('<body onload="alert(1)">x</body>');
    expect(out).not.toMatch(/onload/i);
  });
});

describe("sanitizeHtml — dangerous URL schemes", () => {
  it("strips javascript: URLs from href", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("strips javascript: URLs from img src", () => {
    const out = sanitizeHtml('<img src="javascript:alert(1)">');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("keeps ordinary http/https links", () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
  });
});

describe("sanitizeHtml — disallowed tags are discarded", () => {
  it("strips <style> tags", () => {
    const out = sanitizeHtml('<style>body{display:none}</style><p>hi</p>');
    expect(out).not.toMatch(/<style/i);
    expect(out).toContain("<p>hi</p>");
  });

  it("strips <form> and its inputs", () => {
    const out = sanitizeHtml('<form action="https://evil.example"><input name="x"></form>');
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/<input/i);
  });

  it("strips <object> and <embed>", () => {
    const out = sanitizeHtml('<object data="evil.swf"></object><embed src="evil.swf">');
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
  });

  it("strips SVG <foreignObject> and <use>", () => {
    const out = sanitizeHtml('<svg><foreignObject><script>alert(1)</script></foreignObject></svg><use href="#x"/>');
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toMatch(/<use/i);
  });

  it("discards unknown/disallowed tags without escaping them into text", () => {
    const out = sanitizeHtml('<script>alert(1)</script>');
    // disallowedTagsMode: "discard" means the tag content for script is
    // dropped entirely, not turned into visible escaped text.
    expect(out).not.toContain("&lt;script&gt;");
  });
});

describe("sanitizeHtml — iframe allowlist", () => {
  it("keeps a YouTube iframe", () => {
    const out = sanitizeHtml('<iframe src="https://www.youtube.com/embed/xyz"></iframe>');
    expect(out).toMatch(/<iframe/i);
    expect(out).toContain("youtube.com/embed/xyz");
  });

  it("keeps a Vimeo player iframe", () => {
    const out = sanitizeHtml('<iframe src="https://player.vimeo.com/video/123"></iframe>');
    expect(out).toMatch(/<iframe/i);
  });

  it("strips an iframe pointing at an arbitrary/untrusted domain", () => {
    const out = sanitizeHtml('<iframe src="https://evil.example/phishing"></iframe>');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toContain("evil.example");
  });

  it("strips an iframe with no src", () => {
    const out = sanitizeHtml('<iframe></iframe>');
    expect(out).not.toMatch(/<iframe/i);
  });
});

describe("sanitizeHtml — safe formatting is preserved", () => {
  it("keeps headings, paragraphs, and inline formatting", () => {
    const out = sanitizeHtml('<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> text.</p>');
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });

  it("keeps lists", () => {
    const out = sanitizeHtml('<ul><li>one</li><li>two</li></ul>');
    expect(out).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it("keeps tables", () => {
    const out = sanitizeHtml('<table><tr><th>H</th></tr><tr><td>D</td></tr></table>');
    expect(out).toContain("<table>");
    expect(out).toContain("<td>D</td>");
  });

  it("keeps a safe image with alt text", () => {
    const out = sanitizeHtml('<img src="/uploads/photo.png" alt="A photo" width="200">');
    expect(out).toContain('src="/uploads/photo.png"');
    expect(out).toContain('alt="A photo"');
  });

  it("keeps class/id/style on generic containers", () => {
    const out = sanitizeHtml('<div class="card" id="main" style="color:red">x</div>');
    expect(out).toContain('class="card"');
    expect(out).toContain('id="main"');
  });
});

describe("sanitizeHtml — empty/edge input", () => {
  it("handles an empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("handles plain text with no markup", () => {
    expect(sanitizeHtml("just text")).toBe("just text");
  });
});
