import { describe, it, expect } from "vitest";
import { normalizeBlockTree, safeProps } from "@/lib/block-tree";
import { getBlockDefinition } from "@/lib/blocks";
import type { AudioProps } from "@/types";
import {
  ACCEPT,
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  extensionList,
  extensionOf,
  libraryFor,
  mediaKindOf,
} from "@/lib/media-kind";
import { hasText, shownFields } from "@/lib/audio-fields";
import { describeRemoteAudio, remoteAudioProblem } from "@/lib/audio-address";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_TYPES } from "@/lib/uploads";
import { auditSite } from "@/lib/legal/audit";
import { parseByteRange } from "@/lib/byte-range";

/** One audio block through the validator every write path and read path uses. */
function audio(props: unknown): AudioProps {
  const result = normalizeBlockTree([{ id: "a1", type: "audio", props }]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.tree).toHaveLength(1);
  return result.tree[0].props as AudioProps;
}

describe("an audio block's source", () => {
  it("keeps a file from the library and an https address", () => {
    expect(audio({ src: "/uploads/mu59seflqpe0.mp3" }).src).toBe("/uploads/mu59seflqpe0.mp3");
    expect(audio({ src: "https://cdn.example.com/episode-4.ogg" }).src).toBe("https://cdn.example.com/episode-4.ogg");
    // Pasted with the whitespace a copy from a web page brings along.
    expect(audio({ src: "  /uploads/a.wav \n" }).src).toBe("/uploads/a.wav");
  });

  it("refuses a scheme that runs something", () => {
    // The published page's CSP would refuse these; the downloaded site has
    // only `script-src 'none'`, and nothing else should rely on that alone.
    for (const src of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "vbscript:msgbox(1)", "file:///etc/passwd"]) {
      expect(audio({ src }).src).toBe("");
    }
  });

  it("refuses every data: address, a picture's included", () => {
    // A picture may arrive inline because the clipboard pastes it that way. A
    // sound never does, and one inline would be a whole file in the page's
    // row, past the upload route's size cap and its check of the bytes.
    for (const src of [
      "data:audio/mpeg;base64,SUQzBAAAAAAA",
      "data:audio/wav;base64,UklGRiQAAABXQVZF",
      "data:image/png;base64,iVBORw0KGgo=",
      "data:text/html,<script>alert(1)</script>",
      " DATA:audio/ogg;base64,T2dnUw==",
    ]) {
      expect(audio({ src }).src).toBe("");
    }
  });

  it("is not a link, so mailto: and tel: are refused too", () => {
    expect(audio({ src: "mailto:someone@example.com" }).src).toBe("");
    expect(audio({ src: "tel:+441234567890" }).src).toBe("");
  });

  it("repairs a source that is not a string instead of dropping the block", () => {
    for (const src of [42, null, { url: "/uploads/a.mp3" }, ["x"], undefined]) {
      expect(audio({ src, title: "Kept" })).toMatchObject({ src: "", title: "Kept" });
    }
  });
});

describe("an audio block's words", () => {
  it("sanitises the title and the description", () => {
    const props = audio({
      src: "/uploads/a.mp3",
      title: 'Episode <b>4</b><script>alert(1)</script><img src=x onerror="alert(2)">',
      description: '<a href="javascript:alert(3)" onclick="alert(4)">Show notes</a> and <em>more</em>',
    });
    expect(props.title).toContain("<b>4</b>");
    expect(props.title).not.toMatch(/<script|alert\(1\)|<img|onerror/i);
    expect(props.description).toContain("Show notes");
    expect(props.description).toContain("<em>more</em>");
    expect(props.description).not.toMatch(/javascript:|onclick/i);
  });

  it("caps their length", () => {
    const props = audio({ title: "t".repeat(5000), description: "d".repeat(50_000) });
    expect(props.title.length).toBeLessThanOrEqual(300);
    expect(props.description.length).toBeLessThanOrEqual(2000);
  });

  it("makes a mistyped title or description empty, keeping the rest", () => {
    const props = audio({ src: "/uploads/a.mp3", title: ["not", "text"], description: 7 });
    expect(props).toEqual({ src: "/uploads/a.mp3", title: "", description: "" });
  });

  it("fills in what is missing altogether", () => {
    expect(audio({})).toEqual({ src: "", title: "", description: "" });
    expect(audio("not an object")).toEqual({ src: "", title: "", description: "" });
  });
});

describe("the audio block at render", () => {
  it("is parsed again from whatever a pre-validator row holds", () => {
    const fallback: AudioProps = { src: "", title: "", description: "" };
    const props = safeProps<AudioProps>("audio", { src: "javascript:alert(1)", title: "<script>x</script>Hi" }, fallback);
    expect(props.src).toBe("");
    expect(props.title).toBe("Hi");
  });

  it("offers a default that survives the validator unchanged", () => {
    // The MCP server hands these to an agent as the example of a good block.
    const defaults = getBlockDefinition("audio")?.defaultProps as AudioProps;
    expect(defaults).toBeTruthy();
    expect(audio(defaults)).toEqual(defaults);
    expect(defaults.title.trim()).not.toBe("");
    expect(defaults.description.trim()).not.toBe("");
    // Empty, as the video block's is: the block asks for a file rather than
    // shipping one hosted by somebody else.
    expect(defaults.src).toBe("");
  });
});

describe("telling an upload's kind from its address", () => {
  it("knows a picture", () => {
    for (const url of ["/uploads/a.png", "/uploads/b.JPG", "/uploads/c.jpeg", "/uploads/d.webp", "/uploads/e.svg", "/stock/nature/f.jpg"]) {
      expect(mediaKindOf(url)).toBe("image");
    }
  });

  it("knows a sound", () => {
    for (const url of ["/uploads/a.mp3", "/uploads/b.WAV", "/uploads/c.ogg", "https://cdn.example.com/show/ep-4.mp3"]) {
      expect(mediaKindOf(url)).toBe("audio");
    }
  });

  it("knows a video", () => {
    expect(mediaKindOf("/uploads/a.mp4")).toBe("video");
    expect(mediaKindOf("/uploads/a.webm")).toBe("video");
  });

  it("calls everything else other — the files that showed as broken thumbnails", () => {
    for (const url of ["/uploads/menu.pdf", "/uploads/brand.woff2", "/uploads/brand.ttf", "/uploads/noextension", "", "/uploads/"]) {
      expect(mediaKindOf(url)).toBe("other");
    }
  });

  it("reads only the file's own name, not its query, fragment or folder", () => {
    expect(mediaKindOf("https://cdn.example.com/feed.xml?file=episode.mp3")).toBe("other");
    expect(mediaKindOf("https://cdn.example.com/episode.mp3?download=1#t=30")).toBe("audio");
    expect(mediaKindOf("/uploads/folder.mp3/readme")).toBe("other");
    // A name that is all extension is a hidden file, not a sound.
    expect(extensionOf("/uploads/.mp3")).toBe("");
  });

  it("reads a data: address's own type", () => {
    expect(mediaKindOf("data:image/png;base64,iVBORw0KGgo=")).toBe("image");
    expect(mediaKindOf("data:audio/mpeg;base64,SUQz")).toBe("audio");
    expect(mediaKindOf("data:text/html,<p>")).toBe("other");
  });

  it("works on a bare file name, which is what the upload input hands over", () => {
    expect(mediaKindOf("Episode 4 — final mix.MP3")).toBe("audio");
    expect(mediaKindOf("Café Sunset Hero.png")).toBe("image");
  });
});

describe("the lists agree with what the server serves", () => {
  // The upload route serves each extension with a content type taken from
  // `CONTENT_TYPES`. If an image type were added there and not here, the
  // picker would hide the new pictures; if one were listed here that the
  // server does not serve, the picker would offer a file that cannot load.
  it("lists every image, audio and video type the uploads route serves, and nothing it does not", () => {
    for (const [ext, type] of Object.entries(CONTENT_TYPES)) {
      const family = type.split("/")[0];
      const expected = family === "image" || family === "audio" || family === "video" ? family : "other";
      expect(`${ext}: ${mediaKindOf(`/uploads/x.${ext}`)}`).toBe(`${ext}: ${expected}`);
    }
    for (const ext of [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]) {
      expect(CONTENT_TYPES[ext], ext).toBeTruthy();
    }
  });

  it("asks the file dialog for sounds by extension and by type", () => {
    for (const ext of AUDIO_EXTENSIONS) expect(ACCEPT.audio.split(",")).toContain(`.${ext}`);
    expect(ACCEPT.audio).toContain("audio/mpeg");
    // Pictures keep what the picker has always asked for.
    expect(ACCEPT.image).toBe("image/*");
  });

  it("names the sound formats in a sentence", () => {
    expect(extensionList("audio")).toBe("MP3, WAV or OGG");
  });
});

describe("an audio block in the privacy audit", () => {
  const site = (props: Partial<AudioProps>) =>
    auditSite({
      pages: [
        {
          title: "Episodes",
          content: JSON.stringify([
            // Inside a section, as a featured episode usually is.
            { id: "s", type: "section", props: {}, children: [{ id: "a", type: "audio", props: { title: "", description: "", ...props } }] },
          ]),
        },
      ],
    });

  it("names the host of a recording played from the web", () => {
    // The panel promises this: a file from the web needs a connection, and
    // the privacy notice says whose.
    const audit = site({ src: "https://media.example-podcasts.com/show/ep-4.mp3" });
    expect(audit.remoteHosts).toEqual(["media.example-podcasts.com"]);
    expect(audit.selfContained).toBe(false);
  });

  it("finds nothing to declare for a file from the library", () => {
    const audit = site({ src: "/uploads/mu59seflqpe0.mp3" });
    expect(audit.remoteHosts).toEqual([]);
    expect(audit.selfContained).toBe(true);
  });
});

describe("the part of a recording a player asks for", () => {
  // The uploads route ignored `Range`, so the published page's player could
  // not seek and Safari would not play at all. These are the answers the
  // route needs to give instead.
  const size = 132_344; // the three-second WAV the browser check used

  it("reads the three forms a media element sends", () => {
    expect(parseByteRange("bytes=0-", size)).toEqual({ start: 0, end: size - 1 });
    expect(parseByteRange("bytes=100-199", size)).toEqual({ start: 100, end: 199 });
    expect(parseByteRange("bytes=-500", size)).toEqual({ start: size - 500, end: size - 1 });
  });

  it("stops at the end of the file", () => {
    expect(parseByteRange(`bytes=100-${size * 2}`, size)).toEqual({ start: 100, end: size - 1 });
    expect(parseByteRange(`bytes=-${size * 2}`, size)).toEqual({ start: 0, end: size - 1 });
  });

  it("calls a range that starts past the end unsatisfiable", () => {
    expect(parseByteRange(`bytes=${size}-`, size)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", size)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-", 0)).toBe("unsatisfiable");
  });

  it("sends the whole file for anything else", () => {
    for (const header of [null, undefined, "", "bytes=", "bytes=-", "items=0-10", "bytes=0-10,20-30", "bytes=20-10", "bytes=abc-", `bytes=${"9".repeat(30)}-`]) {
      expect(parseByteRange(header, size)).toBeNull();
    }
  });
});

/** A source file, for the rules that live in a component the suite cannot draw. */
const source = (...path: string[]) => readFileSync(join(process.cwd(), "src", ...path), "utf8");

describe("clearing an audio block's title on the canvas", () => {
  // Backspacing the title to nothing unmounted it under the caret; focus fell
  // to the page, and the next Backspace deleted the whole block.
  it("keeps the field that has the caret, however empty it gets", () => {
    expect(shownFields({ title: "", description: "" }, "title")).toEqual({ title: true, description: false });
    expect(shownFields({ title: "<br>", description: "" }, "title").title).toBe(true);
    expect(shownFields({ title: "Kept", description: "" }, "description")).toEqual({ title: true, description: true });
  });

  it("lets an emptied field go once the caret has left it", () => {
    expect(shownFields({ title: "", description: "" }, null)).toEqual({ title: false, description: false });
    expect(shownFields({ title: "Kept", description: "&nbsp; <br>" }, "title")).toEqual({ title: true, description: false });
  });

  it("counts only words as something to show", () => {
    for (const empty of ["", "   ", "<br>", "<b></b>", "&nbsp;", " &#160; ", "\u00a0", null, undefined]) {
      expect(hasText(empty as string)).toBe(false);
    }
    expect(hasText("<b>Episode 4</b>")).toBe(true);
    expect(hasText("0")).toBe(true);
  });

  it("is what the block draws from, with focus tracked where it cannot be lost", () => {
    const block = source("components", "blocks", "AudioBlock.tsx");
    expect(block).toContain("shownFields(props, focused)");
    // Capture, because focus and blur do not bubble; and an emptied field is
    // let go only when the one leaving is the one that had the caret.
    expect(block).toContain("onFocusCapture: () => setFocused(field)");
    expect(block).toContain("onBlurCapture: () => setFocused((current) => (current === field ? null : current))");
    expect(block).toMatch(/\{\.\.\.track\("title"\)\}/);
    expect(block).toMatch(/\{\.\.\.track\("description"\)\}/);
  });

  it("saves an emptied field as nothing, not as the <br> a browser leaves behind", () => {
    const block = source("components", "blocks", "AudioBlock.tsx");
    expect(block).toContain("title: wordsOrNothing(title)");
    expect(block).toContain("description: wordsOrNothing(description)");
  });

  it("makes the empty-state pill a button that opens the picker", () => {
    const block = source("components", "blocks", "AudioBlock.tsx");
    expect(block).toContain('<button type="button" onClick={openPicker} className="nvx-audio-empty">');
  });
});

describe("an address typed into the audio panel", () => {
  it("is not handed to the player a keystroke at a time", () => {
    // Every keystroke used to become the block's `src`, and the canvas player
    // fetched each one: https://c/, https://cd/, and paths on the builder.
    const panel = source("components", "editor", "inspectors", "AudioPanel.tsx");
    expect(panel).toContain("onChange={(e) => setDraft(e.target.value)}");
    expect(panel).toContain("onBlur={commit}");
    expect(panel).toMatch(/e\.key === "Enter"[\s\S]{0,80}commit\(\)/);
    expect(panel).not.toMatch(/set\("src", e\.target\.value/);
    // The warning answers the draft, so it still speaks as you type.
    expect(panel).toContain("remoteAudioProblem(draft)");
  });

  it("warns about an address that will not play", () => {
    expect(remoteAudioProblem("http://example.com/a.mp3")).toMatch(/https:\/\//);
    expect(remoteAudioProblem("cdn.example.com/a.mp3")).toMatch(/https:\/\//);
    expect(remoteAudioProblem("https://example.com/cover.jpg")).toMatch(/\.jpg.*not a sound file/);
    expect(remoteAudioProblem("https://example.com/feed.xml?file=a.mp3")).toMatch(/\.xml/);
  });

  it("says nothing about one that looks right, or about none at all", () => {
    expect(remoteAudioProblem("")).toBeNull();
    expect(remoteAudioProblem("   ")).toBeNull();
    expect(remoteAudioProblem("https://cdn.example.com/ep-4.MP3")).toBeNull();
    expect(remoteAudioProblem(" https://cdn.example.com/ep-4.ogg?dl=1 ")).toBeNull();
    // No extension: plenty of hosts serve a recording from a path like this.
    expect(remoteAudioProblem("https://podcasts.example.com/episodes/42/download")).toBeNull();
  });

  it("is named by its file and its host", () => {
    expect(describeRemoteAudio("https://cdn.example.com/show/Episode%204.mp3")).toBe("Episode 4.mp3 from cdn.example.com");
    expect(describeRemoteAudio("https://cdn.example.com/")).toBe("cdn.example.com");
    expect(describeRemoteAudio("https://cdn.example.com/100%.mp3")).toBe("100%.mp3 from cdn.example.com");
    expect(describeRemoteAudio("not a url")).toBe("not a url");
  });
});

describe("what the library offers and what it only lists", () => {
  const files = [
    { url: "/uploads/a.png" },
    { url: "/uploads/b.mp3" },
    { url: "/uploads/c.pdf" },
    { url: "/uploads/d.woff2" },
    { url: "/uploads/e.mp4" },
    { url: "/uploads/f.wav" },
    { url: "/uploads/g.svg" },
  ];

  it("offers pictures to the picture library and lists everything else apart, for deleting", () => {
    // Once the picture grid stopped listing PDFs, fonts and video files, the
    // picker — the only place an upload can be deleted — could not reach them.
    const { choosable, other } = libraryFor(files, "image");
    expect(choosable.map((f) => f.url)).toEqual(["/uploads/a.png", "/uploads/g.svg"]);
    expect(other.map((f) => f.url)).toEqual(["/uploads/b.mp3", "/uploads/c.pdf", "/uploads/d.woff2", "/uploads/e.mp4", "/uploads/f.wav"]);
  });

  it("offers sounds to the sound library and lists nothing else there", () => {
    const { choosable, other } = libraryFor(files, "audio");
    expect(choosable.map((f) => f.url)).toEqual(["/uploads/b.mp3", "/uploads/f.wav"]);
    expect(other).toEqual([]);
  });

  it("is drawn with a delete button for each of the others", () => {
    const picker = source("components", "editor", "MediaPicker.tsx");
    expect(picker).toContain("libraryFor(files, kind)");
    expect(picker).toMatch(/otherFiles\.map\(\(f\) => \([\s\S]{0,900}aria-label=\{`Delete \$\{f\.name\}`\}[\s\S]{0,120}handleDelete\(f\.url\)/);
  });
});
