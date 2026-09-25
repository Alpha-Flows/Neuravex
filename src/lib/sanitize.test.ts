import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeInlineHtml } from "@/lib/sanitize";

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
    // Prefixed, so content cannot take a name the page already uses.
    expect(out).toContain('id="c-main"');
    expect(out).toContain("color:red");
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

describe("sanitizeHtml — the style attribute is parsed, not copied", () => {
  it("drops a declaration that fetches", () => {
    const out = sanitizeHtml('<div style="background:url(https://attacker.example/log)">x</div>');
    expect(out).not.toContain("attacker.example");
  });

  it("drops one written with a CSS escape", () => {
    // A browser reads \75 rl( as url(. A pattern over the text does not.
    const out = sanitizeHtml('<div style="background:\\75 rl(https://attacker.example/log)">x</div>');
    expect(out).not.toContain("attacker.example");
  });

  it("drops the full-page overlay", () => {
    const out = sanitizeHtml('<div style="position:fixed;inset:0;z-index:9999">x</div>');
    expect(out).not.toMatch(/position/i);
    expect(out).not.toMatch(/z-index/i);
    expect(out).not.toMatch(/inset/i);
  });

  it("keeps an ordinary colour", () => {
    expect(sanitizeHtml('<p style="color:red">x</p>')).toContain("color:red");
  });

  it("keeps a reference inside the same document", () => {
    expect(sanitizeHtml('<div style="fill:url(#grad)">x</div>')).toContain("url(#grad)");
  });

  it("drops a custom property, which can be read back into anything", () => {
    expect(sanitizeHtml('<div style="--x:red">y</div>')).not.toContain("--x");
  });
});

describe("sanitizeHtml — the id collision that stopped React hydrating", () => {
  it("renames __next_f out of the way", () => {
    // Sanitised content is rendered before Next's bootstrap script, so an
    // element with this name won the race and every push threw. The published
    // page lost its forms and menus; the editor for that site went inert.
    const out = sanitizeHtml('<div id="__next_f"></div>');
    expect(out).not.toContain('id="__next_f"');
    expect(out).toContain('id="c-__next_f"');
  });

  it("moves an in-page anchor to match", () => {
    const out = sanitizeHtml('<a href="#section">go</a><div id="section"></div>');
    expect(out).toContain('href="#c-section"');
    expect(out).toContain('id="c-section"');
  });
});

describe("sanitizeHtml — iframe hosts are matched whole", () => {
  for (const src of [
    "https://youtube.com.evil.example/x",
    "https://vimeo.com@evil.example/x",
    "//youtube.com.evil.example/x",
    "http://www.youtube.com/embed/x",
  ]) {
    it(`strips ${src}`, () => {
      const out = sanitizeHtml(`<iframe src="${src}"></iframe>`);
      expect(out).not.toContain("evil.example");
      if (src.startsWith("http://")) expect(out).not.toMatch(/<iframe/i);
    });
  }

  it("sandboxes and restricts what survives", () => {
    const out = sanitizeHtml('<iframe src="https://www.youtube.com/embed/xyz" allow="camera; microphone"></iframe>');
    expect(out).toContain("sandbox=");
    expect(out).not.toContain("camera");
    expect(out).not.toContain("microphone");
  });
});

describe("sanitizeHtml — link schemes", () => {
  it("drops a data: link but keeps a data: image", () => {
    expect(sanitizeHtml('<a href="data:application/octet-stream;base64,AA">x</a>')).not.toContain("data:");
    expect(sanitizeHtml('<img src="data:image/png;base64,AA">')).toContain("data:image/png");
  });

  it("puts rel on a link that opens a new tab", () => {
    const out = sanitizeHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe("sanitizeInlineHtml — what a rich-text prop may contain", () => {
  it("keeps what the formatting toolbar produces", () => {
    const out = sanitizeInlineHtml('Hello <strong>there</strong> and <em>you</em><br>');
    expect(out).toBe("Hello <strong>there</strong> and <em>you</em><br />");
  });

  it("drops a <style> element that restyled the whole builder", () => {
    expect(sanitizeInlineHtml("<style>body{outline:solid 5px red}</style>hi")).toBe("hi");
  });

  it("drops a beacon image and a frame", () => {
    const out = sanitizeInlineHtml('<img src="https://attacker.example/b.gif"><iframe src="https://attacker.example/"></iframe>ok');
    expect(out).toBe("ok");
  });

  it("drops a meta refresh that navigated the editor away", () => {
    expect(sanitizeInlineHtml('<meta http-equiv="refresh" content="0;url=https://attacker.example/">x')).toBe("x");
  });

  it("drops a form", () => {
    expect(sanitizeInlineHtml('<form action="https://attacker.example"><input></form>x')).toBe("x");
  });

  it("keeps a safe link and refuses a javascript: one", () => {
    expect(sanitizeInlineHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
    expect(sanitizeInlineHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
  });

  it("is a no-op on plain text", () => {
    expect(sanitizeInlineHtml("just words")).toBe("just words");
  });

  it("answers empty for anything that is not a string", () => {
    expect(sanitizeInlineHtml(undefined as unknown as string)).toBe("");
  });
});

describe("sanitizeInlineHtml — the rest of the formatting toolbar", () => {
  it("keeps underline and strikethrough, the latter as <s> whatever the browser wrote", () => {
    expect(sanitizeInlineHtml("<u>under</u> <strike>struck</strike> <s>also</s>")).toBe("<u>under</u> <s>struck</s> <s>also</s>");
  });

  it("keeps a colour and a highlight, the site's palette colours included", () => {
    expect(sanitizeInlineHtml('<span style="color: rgb(220, 38, 38);">red</span>')).toBe('<span style="color:rgb(220, 38, 38)">red</span>');
    expect(sanitizeInlineHtml('<span style="background-color: var(--site-color-2, #fef08a);">marked</span>')).toBe(
      '<span style="background-color:var(--site-color-2, #fef08a)">marked</span>',
    );
  });

  it("still drops a colour that fetches something, in a <strike> as anywhere", () => {
    expect(sanitizeInlineHtml('<strike style="background:url(https://attacker.example/b)">x</strike>')).toBe("<s>x</s>");
  });

  it("settles in one pass, so a struck word saved twice is saved the same", () => {
    const once = sanitizeInlineHtml("<b><strike>bold</strike> word</b>");
    expect(once).toBe("<b><s>bold</s> word</b>");
    expect(sanitizeInlineHtml(once)).toBe(once);
  });
});
