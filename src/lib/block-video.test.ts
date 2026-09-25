import { describe, it, expect } from "vitest";
import { Parser } from "htmlparser2";
import { normalizeBlockTree } from "@/lib/block-tree";
import { sanitizeHtml } from "@/lib/sanitize";
import { isAllowedEmbed } from "@/lib/embed-hosts";
import { auditSite, remoteHost } from "@/lib/legal/audit";
import { getBlockDefinition } from "@/lib/blocks";
import { buildDatenschutz } from "@/lib/legal/datenschutz";
import { emptyProfile } from "@/lib/legal/profile";
import { DEFAULT_LOOK } from "@/lib/page-starters";
import type { BaseBlock } from "@/types";
import {
  VIDEO_FRAME,
  parseStartTime,
  videoEmbed,
  videoEmbedHost,
  looksLikeVideoFile,
  videoFileHost,
  videoSiteOf,
  videoTitle,
} from "@/lib/video-embed";

const ID = "dQw4w9WgXcQ";
const NOCOOKIE = `https://www.youtube-nocookie.com/embed/${ID}`;

const videoBlock = (props: Record<string, unknown>) => ({ id: "v", type: "video", props });

function normalised(props: Record<string, unknown>) {
  const result = normalizeBlockTree([videoBlock(props)]);
  if (!result.ok) throw new Error("the tree was refused");
  return result.tree[0].props;
}

describe("a YouTube link becomes the nocookie player", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}&list=PL123&index=2`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&feature=share`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abcDEF123`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/live/${ID}?feature=shared`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`//www.youtube.com/embed/${ID}`],
    [`youtu.be/${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`  https://youtu.be/${ID}/  `],
    [`\\\\www.youtube.com\\watch?v=${ID}`],
  ])("%s", (link) => {
    const embed = videoEmbed(link);
    expect(embed).not.toBeNull();
    expect(embed!.provider).toBe("youtube");
    expect(embed!.id).toBe(ID);
    expect(embed!.embedUrl).toBe(NOCOOKIE);
    expect(isAllowedEmbed(embed!.embedUrl)).toBe(true);
    expect(videoEmbedHost(embed!)).toBe("www.youtube-nocookie.com");
  });

  it("marks a Short as upright and nothing else", () => {
    expect(videoEmbed(`https://www.youtube.com/shorts/${ID}`)!.upright).toBe(true);
    expect(videoEmbed(`https://youtu.be/${ID}`)!.upright).toBe(false);
  });

  it.each([
    [`https://www.youtube.com/watch?v=${ID}&t=90`, 90],
    [`https://www.youtube.com/watch?v=${ID}&t=90s`, 90],
    [`https://youtu.be/${ID}?t=1m30s`, 90],
    [`https://youtu.be/${ID}?t=1h2m3s`, 3723],
    [`https://www.youtube.com/embed/${ID}?start=45`, 45],
    [`https://www.youtube.com/watch?v=${ID}#t=2m`, 120],
  ])("keeps the start time in %s", (link, seconds) => {
    expect(videoEmbed(link)!.embedUrl).toBe(`${NOCOOKIE}?start=${seconds}`);
  });

  it("drops a start time it cannot read, or one of zero, rather than guessing", () => {
    expect(videoEmbed(`https://youtu.be/${ID}?t=soon`)!.embedUrl).toBe(NOCOOKIE);
    expect(videoEmbed(`https://youtu.be/${ID}?t=0`)!.embedUrl).toBe(NOCOOKIE);
    expect(parseStartTime("1m30s")).toBe(90);
    expect(parseStartTime("")).toBe(0);
    expect(parseStartTime("-5")).toBe(0);
  });

  it("carries nothing else of the pasted link across", () => {
    const embed = videoEmbed(`https://www.youtube.com/watch?v=${ID}&list=PL1&autoplay=1&origin=https://evil.example`);
    expect(embed!.embedUrl).toBe(NOCOOKIE);
  });
});

describe("a Vimeo link becomes the do-not-track player", () => {
  it.each([
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://www.vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://vimeo.com/76979871?share=copy", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://vimeo.com/channels/staffpicks/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://vimeo.com/groups/shortfilms/videos/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://vimeo.com/showcase/123/video/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://player.vimeo.com/video/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://vimeo.com/manage/videos/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
  ])("%s", (link, expected) => {
    const embed = videoEmbed(link);
    expect(embed).not.toBeNull();
    expect(embed!.provider).toBe("vimeo");
    expect(embed!.id).toBe("76979871");
    expect(embed!.embedUrl).toBe(expected);
    expect(isAllowedEmbed(embed!.embedUrl)).toBe(true);
    expect(videoEmbedHost(embed!)).toBe("player.vimeo.com");
  });

  it("keeps the hash an unlisted video cannot be played without", () => {
    expect(videoEmbed("https://vimeo.com/76979871/a1b2c3d4e5")!.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=a1b2c3d4e5&dnt=1",
    );
    expect(videoEmbed("https://player.vimeo.com/video/76979871?h=a1b2c3d4e5&badge=0")!.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=a1b2c3d4e5&dnt=1",
    );
    expect(videoEmbed("https://vimeo.com/manage/videos/76979871/a1b2c3d4e5")!.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=a1b2c3d4e5&dnt=1",
    );
  });

  it("refuses a hash that is not one, and a page about a video that is not the video", () => {
    expect(videoEmbed("https://player.vimeo.com/video/76979871?h=a1b2%22onload%3D")).toBeNull();
    expect(videoEmbed("https://vimeo.com/76979871/likes")).toBeNull();
    expect(videoEmbed("https://vimeo.com/manage/videos/76979871/settings")).toBeNull();
  });

  it("keeps a start time from the fragment, where Vimeo puts it", () => {
    expect(videoEmbed("https://vimeo.com/76979871#t=1m5s")!.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?dnt=1#t=65s",
    );
  });
});

describe("what is not a YouTube or Vimeo video", () => {
  it.each([
    [`https://youtube.com.evil.com/watch?v=${ID}`],
    [`https://evil.com/youtube.com/watch?v=${ID}`],
    [`https://evil.com/?u=https://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com@evil.com/watch?v=${ID}`],
    [`https://user:pass@www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com:8443/watch?v=${ID}`],
    [`https://notyoutube.com/watch?v=${ID}`],
    [`https://www.youtube.com.evil.com/embed/${ID}`],
    [`https://vimeo.com.evil.com/76979871`],
    [`https://evil.com/vimeo.com/76979871`],
    [`javascript:alert(1)//https://www.youtube.com/watch?v=${ID}`],
    [`data:text/html,<iframe src="https://youtu.be/${ID}">`],
    [`ftp://www.youtube.com/watch?v=${ID}`],
  ])("refuses the look-alike %s", (link) => {
    expect(videoEmbed(link)).toBeNull();
  });

  it.each([
    ["https://www.youtube.com/watch?v=short"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQx"],
    ["https://www.youtube.com/watch?v=dQw4w9W%2FXcQ"],
    ["https://youtu.be/../../x/dQw"],
    ["https://www.youtube.com/embed/videoseries?list=PL123"],
    ["https://www.youtube.com/watch"],
    ["https://www.youtube.com/@somechannel"],
    ["https://www.youtube.com/results?search_query=cats"],
    ["https://youtu.be/"],
    [`https://youtu.be/${ID}/extra`],
    ["https://vimeo.com/abc"],
    ["https://vimeo.com/123456789012345"],
    ["https://vimeo.com/channels/staffpicks"],
    ["https://player.vimeo.com/video/abc"],
  ])("refuses the bad id in %s", (link) => {
    expect(videoEmbed(link)).toBeNull();
  });

  it("leaves a video file alone", () => {
    for (const file of ["https://cdn.example/clip.mp4", "/uploads/clip.mp4", "clip.webm", "", undefined, null, 42]) {
      expect(videoEmbed(file)).toBeNull();
    }
  });

  it("still knows a YouTube or Vimeo address it could find no video in, so the panel can say so", () => {
    expect(videoSiteOf("https://www.youtube.com/@somechannel")).toBe("youtube");
    expect(videoSiteOf("https://vimeo.com/channels/staffpicks")).toBe("vimeo");
    expect(videoSiteOf("https://youtube.com.evil.com/watch?v=x")).toBeNull();
    expect(videoSiteOf("https://cdn.example/clip.mp4")).toBeNull();
  });

  it("names the server a video file comes from, and none for this site's own", () => {
    expect(videoFileHost("https://cdn.example/clip.mp4")).toBe("cdn.example");
    expect(videoFileHost("//cdn.example/clip.mp4")).toBe("cdn.example");
    expect(videoFileHost("/uploads/clip.mp4")).toBeNull();
    expect(videoFileHost("clip.mp4")).toBeNull();
  });

  it("reads a backslash the way a browser does, as somebody else's server", () => {
    expect(videoFileHost("/\\cdn.example/clip.mp4")).toBe("cdn.example");
    expect(videoFileHost("\\\\cdn.example\\clip.mp4")).toBe("cdn.example");
  });

  it("gives the panel the host the privacy audit names, whatever the address", () => {
    for (const address of [
      "https://cdn.example/clip.mp4",
      "http://cdn.example:8080/clip.mp4",
      "//cdn.example/clip.mp4",
      "/\\cdn.example/clip.mp4",
      "\\\\cdn.example\\clip.mp4",
      "/uploads/clip.mp4",
      "./clip.mp4",
      "clip.mp4",
      "#top",
      "data:image/png;base64,AAAA",
      "mailto:a@b.example",
      "",
    ]) {
      expect(videoFileHost(address), address).toBe(remoteHost(address));
    }
  });

  it("knows a video file by its ending, and a page from another video site by the lack of one", () => {
    for (const file of [
      "https://cdn.example/clip.mp4",
      "https://cdn.example/clip.WEBM?token=1",
      "/uploads/clip.mov",
      "clip.m4v",
      "\\\\cdn.example\\clip.ogv",
    ]) {
      expect(looksLikeVideoFile(file), file).toBe(true);
    }
    for (const page of [
      "https://www.dailymotion.com/video/x8abcd",
      "https://cdn.example/feed.xml?file=clip.mp4",
      "https://cdn.example/clip.mp3",
      "",
    ]) {
      expect(looksLikeVideoFile(page), page).toBe(false);
    }
  });
});

describe("the frame is the one the sanitiser would have kept", () => {
  /** The attributes of the first element with this tag in a fragment. */
  function attributesOf(html: string, tag: string): Record<string, string> {
    let found: Record<string, string> = {};
    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === tag && Object.keys(found).length === 0) found = attribs;
      },
    });
    parser.write(html);
    parser.end();
    return found;
  }

  it("has the same sandbox, allow list, referrer policy and loading", () => {
    const kept = attributesOf(sanitizeHtml(`<iframe src="${NOCOOKIE}"></iframe>`), "iframe");
    expect(VIDEO_FRAME.sandbox).toBe(kept.sandbox);
    expect(VIDEO_FRAME.allow).toBe(kept.allow);
    expect(VIDEO_FRAME.referrerPolicy).toBe(kept.referrerpolicy);
    expect(VIDEO_FRAME.loading).toBe(kept.loading);
  });

  it("is named for a screen reader", () => {
    expect(videoTitle("", videoEmbed(`https://youtu.be/${ID}`))).toBe("YouTube video");
    expect(videoTitle("  ", videoEmbed("https://vimeo.com/76979871"))).toBe("Vimeo video");
    expect(videoTitle("Our workshop", videoEmbed(`https://youtu.be/${ID}`))).toBe("Our workshop");
    expect(videoTitle("", null)).toBeUndefined();
    expect(videoTitle("Our workshop", null)).toBe("Our workshop");
  });
});

describe("the video block's schema", () => {
  it("stores a YouTube link as it was pasted", () => {
    const link = `https://www.youtube.com/watch?v=${ID}&t=90`;
    expect(normalised({ src: link }).src).toBe(link);
  });

  it("still refuses a scheme that runs something", () => {
    const props = normalised({ src: "javascript:alert(1)", poster: "javascript:x" });
    expect(props.src).toBe("");
    expect(props.poster).toBe("");
  });

  it("keeps the title as plain text, cut to length rather than emptied", () => {
    expect(normalised({ src: "", title: "Our workshop in two minutes" }).title).toBe("Our workshop in two minutes");
    expect(normalised({ src: "", title: "x".repeat(1000) }).title).toHaveLength(300);
    expect(normalised({ src: "", title: '<img src="https://x.example/p.gif">Hi' }).title).toBe('img src="https://x.example/p.gif"Hi');
    expect(normalised({ src: "", title: "line\none" }).title).toBe("lineone");
    expect(normalised({ src: "", title: 42 }).title).toBe("");
    expect(normalised({ src: "" }).title).toBe("");
  });

  it("repairs a ratio it does not know", () => {
    expect(normalised({ src: "", ratio: "21/9" }).ratio).toBe("16/9");
  });

  it("starts empty, with a title field for the example an agent is shown", () => {
    const defaults = getBlockDefinition("video")!.defaultProps as Record<string, unknown>;
    expect(defaults.src).toBe("");
    expect(defaults.title).toBe("");
  });
});

describe("the privacy audit and a video block", () => {
  const page = (props: Record<string, unknown>) => ({ title: "Home", content: JSON.stringify([videoBlock(props)]) });

  it("reports a YouTube link as an embed from the nocookie host, needing consent", () => {
    const audit = auditSite({ pages: [page({ src: `https://www.youtube.com/watch?v=${ID}`, poster: "https://img.example/p.jpg" })] });
    expect(audit.remoteHosts).toEqual(["www.youtube-nocookie.com"]);
    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0]).toMatchObject({ kind: "embed", host: "www.youtube-nocookie.com", needsConsent: true });
    expect(audit.selfContained).toBe(false);
  });

  it("reports a Vimeo link as an embed from the player host", () => {
    const audit = auditSite({ pages: [page({ src: "https://vimeo.com/76979871" })] });
    expect(audit.remoteHosts).toEqual(["player.vimeo.com"]);
    expect(audit.findings[0]).toMatchObject({ kind: "embed", host: "player.vimeo.com", needsConsent: true });
  });

  it("still reports a video file on another server, and its poster", () => {
    const audit = auditSite({ pages: [page({ src: "https://cdn.example/clip.mp4", poster: "https://img.example/p.jpg" })] });
    expect(audit.findings.map((f) => [f.kind, f.host])).toEqual([
      ["remote-video", "cdn.example"],
      ["remote-asset", "img.example"],
    ]);
  });

  it("reports nothing for a YouTube address with no video in it, which is not drawn", () => {
    const audit = auditSite({ pages: [page({ src: "https://www.youtube.com/@somechannel", poster: "https://img.example/p.jpg" })] });
    expect(audit.findings).toEqual([]);
    expect(audit.selfContained).toBe(true);
  });

  it("reports nothing for a poster on a block with no video, which draws nothing", () => {
    const audit = auditSite({ pages: [page({ src: "", poster: "https://img.example/p.jpg" })] });
    expect(audit.findings).toEqual([]);
    expect(audit.selfContained).toBe(true);
  });

  it("reports a video file behind a backslash address, which a browser fetches from that server", () => {
    const audit = auditSite({ pages: [page({ src: "\\\\cdn.example\\clip.mp4" })] });
    expect(audit.findings.map((f) => [f.kind, f.host])).toEqual([["remote-video", "cdn.example"]]);
  });

  it("calls a site with only its own video file self-contained", () => {
    const audit = auditSite({ pages: [page({ src: "/uploads/clip.mp4" })] });
    expect(audit.selfContained).toBe(true);
  });

  it("puts the player's host, and the consent paragraph, into the privacy notice", () => {
    const audit = auditSite({ pages: [page({ src: `https://youtu.be/${ID}` }), page({ src: "https://vimeo.com/76979871" })] });
    const words: string[] = [];
    const collect = (blocks: BaseBlock[]) => {
      for (const b of blocks) {
        if (typeof b.props?.text === "string") words.push(b.props.text);
        if (Array.isArray(b.props?.items)) words.push(...b.props.items);
        if (b.children) collect(b.children);
      }
    };
    collect(buildDatenschutz({ ...emptyProfile(), companyName: "Muster GmbH" }, audit, DEFAULT_LOOK));
    const notice = words.join("\n");
    expect(notice).toContain("Eingebundene Inhalte Dritter");
    expect(notice).toContain("www.youtube-nocookie.com");
    expect(notice).toContain("player.vimeo.com");
    expect(notice).toContain("§ 25 Abs. 1 TDDDG");
    expect(notice).not.toContain("Eine Einwilligung nach § 25 Abs. 1 TDDDG ist daher nicht erforderlich");
  });

  it("does not read markup into a title that is never drawn as markup", () => {
    const stored = normalised({ src: "/uploads/clip.mp4", title: '<img src="https://x.example/p.gif">' });
    const audit = auditSite({ pages: [{ title: "Home", content: JSON.stringify([videoBlock(stored)]) }] });
    expect(audit.selfContained).toBe(true);
  });
});
