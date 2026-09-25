import { normalizeEmbed, EMBED_ALLOW } from "./embed-hosts";
import { extensionOf, VIDEO_EXTENSIONS } from "./media-kind";

/**
 * A YouTube or Vimeo link, turned into the player that belongs in a page.
 *
 * The video block only ever drew a `<video>` element, so a YouTube link pasted
 * into it drew a black box with dead controls: a watch page is an HTML
 * document, not a video file, and no browser will play one. The only way to
 * put a YouTube video on a page was to write an iframe into a Custom HTML
 * block by hand, which also meant the embed came from whichever host the
 * author copied — `www.youtube.com`, which sets its cookies on every visitor
 * before anybody presses play.
 *
 * So the block now reads the link itself. Everything here is a pure function
 * of the string, because the same answer is needed in four places that must
 * agree: the canvas and the published page (which draw the frame), the panel
 * (which says what it recognised), and the privacy audit (which has to name
 * the host the visitor's browser will actually contact). The link the author
 * pasted is what is stored; the embed address is worked out from it each
 * time, so a better rule here reaches every existing block without a
 * migration.
 *
 * Parsing is by `new URL()` and whole-hostname matches, never a pattern over
 * the string. `embed-hosts.ts` explains what the pattern approach let
 * through; `https://www.youtube.com@evil.example/` and
 * `https://youtube.com.evil.example/` are the same two tricks here.
 */

export type VideoProvider = "youtube" | "vimeo";

export interface VideoEmbed {
  provider: VideoProvider;
  /** The provider's own id for the video — eleven characters, or digits. */
  id: string;
  /** The privacy-preserving player address, already checked by `normalizeEmbed`. */
  embedUrl: string;
  /**
   * True for a YouTube Short. They are filmed upright, and in the block's
   * default 16:9 box one plays as a narrow strip between two black bars, so
   * the panel suggests the 9:16 shape.
   */
  upright: boolean;
}

/** What each provider is called in the panel and in a frame's default title. */
export const VIDEO_PROVIDER_NAME: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
};

/**
 * The attributes a player frame is drawn with.
 *
 * These are what the HTML sanitiser gives an iframe written into a Custom
 * HTML block (`embedAttributes` in `sanitize.ts`), copied rather than shared
 * because that function is private to the sanitiser. A test in
 * `block-video.test.ts` sanitises a frame and compares the two, so they
 * cannot drift apart without somebody being told. The reasoning is the
 * sanitiser's: the frame may script itself and go full screen, and may not
 * navigate the page around it, submit forms or open windows — the downloaded
 * site has no CSP to fall back on.
 */
export const VIDEO_FRAME = {
  sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups-to-escape-sandbox",
  allow: EMBED_ALLOW,
  referrerPolicy: "strict-origin-when-cross-origin",
  loading: "lazy",
} as const;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const YOUTUBE_NOCOOKIE_HOSTS = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);
const YOUTU_BE = "youtu.be";
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com"]);
const VIMEO_PLAYER = "player.vimeo.com";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{1,12}$/;
// The hash on an unlisted Vimeo video is hexadecimal. Being strict about it
// is what tells `vimeo.com/123/1a2b3c4d5e` (a private share link) apart from
// `vimeo.com/123/likes` (a page about the video, not the video).
const VIMEO_HASH = /^[0-9a-f]{1,64}$/i;

/** Longer than any link a share button produces, by some way. */
const MAX_LINK = 2000;

/**
 * A host no address can really name, standing in for this site — the rule
 * `remoteHost` in `legal/audit.ts` uses, repeated here because that module
 * brings an HTML parser with it and this one runs in the panel.
 */
const THIS_SITE = new URL("https://self.invalid/");

/**
 * An address resolved the way the browser will resolve it on the page, or
 * null when it stays on this site or is not http(s) at all.
 *
 * Sorting addresses by what they start with read `/\cdn.example/clip.mp4`
 * and `\\cdn.example\clip.mp4` as paths on this site. A browser treats a
 * backslash in an http address as a slash, so both are somebody else's
 * server: the panel told the author the video "travels with this site" while
 * every visitor's browser fetched it from cdn.example. Resolving against a
 * stand-in and seeing whether the stand-in survived is the question the
 * browser itself answers.
 */
function resolveOffSite(src: unknown): URL | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("#") || /^data:/i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed, THIS_SITE);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.host === THIS_SITE.host ? null : url;
}

/**
 * The link as a parsed URL, or null when it is not an http(s) address on
 * another server.
 *
 * A link copied out of an address bar has a scheme, but one typed from
 * memory often does not — `youtu.be/abc` — and a bare reference like that is
 * a relative path to every other part of the app. It is read as https only
 * when it starts with something shaped like a host name, so `/uploads/a.mp4`
 * stays a file on this site. Whatever it was written as, the answer is only
 * ever used to find an id; the player address is built from scratch.
 */
function parse(src: unknown): URL | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed || trimmed.length > MAX_LINK) return null;

  const hostFirst = !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|$)/i.test(trimmed);
  const url = resolveOffSite(hostFirst ? `https://${trimmed}` : trimmed);
  if (!url) return null;
  // A userinfo part was not written by somebody sharing a video; it is how
  // `https://www.youtube.com@evil.example/` names evil.example while reading
  // as YouTube. A port is refused for the same reason: no share link has one.
  if (url.username || url.password || url.port) return null;
  return url;
}

/**
 * A start time in seconds, from `90`, `90s`, `1m30s` or `1h2m3s`.
 *
 * Share links write it both ways — the Share button's "start at" box gives
 * plain seconds, a timestamp copied out of a comment gives `1m30s` — and the
 * embed player only understands seconds. Zero, or anything unreadable, is no
 * start time at all rather than a guess.
 */
export function parseStartTime(value: string | null | undefined): number {
  if (!value) return 0;
  const match = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s?)?$/i.exec(value.trim());
  if (!match) return 0;
  const [, h, m, s] = match;
  const total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/** The first start time the link carries, from its query or an old-style `#t=`. */
function startTimeOf(url: URL): number {
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  return parseStartTime(url.searchParams.get("t")) || parseStartTime(url.searchParams.get("start")) || parseStartTime(fragment.get("t"));
}

function youtubeId(url: URL, host: string, parts: string[]): { id: string; upright: boolean } | null {
  if (host === YOUTU_BE) return parts.length === 1 ? { id: parts[0], upright: false } : null;

  if (YOUTUBE_NOCOOKIE_HOSTS.has(host)) {
    return parts.length === 2 && parts[0] === "embed" ? { id: parts[1], upright: false } : null;
  }

  if (parts.length === 1 && parts[0] === "watch") {
    const v = url.searchParams.get("v");
    return v ? { id: v, upright: false } : null;
  }
  if (parts.length === 2 && ["shorts", "embed", "live"].includes(parts[0])) {
    return { id: parts[1], upright: parts[0] === "shorts" };
  }
  return null;
}

function vimeoIdAndHash(url: URL, host: string, parts: string[]): { id: string; hash?: string } | null {
  // An unlisted video can only be played by somebody who has its hash, so a
  // player address without it shows "this video does not exist". The share
  // link carries it as a second path segment; the embed code carries it as
  // `h=`; both are kept.
  const hashParam = url.searchParams.get("h") ?? undefined;

  if (host === VIMEO_PLAYER) {
    return parts.length === 2 && parts[0] === "video" ? { id: parts[1], hash: hashParam } : null;
  }

  if (parts.length === 1) return { id: parts[0], hash: hashParam };
  if (parts.length === 2 && VIMEO_ID.test(parts[0])) return { id: parts[0], hash: parts[1] };
  if (parts.length === 3 && parts[0] === "channels") return { id: parts[2], hash: hashParam };
  // The address of a video on its owner's own dashboard, which is what an
  // author who uploaded it has open when they copy a link.
  if ((parts.length === 3 || parts.length === 4) && parts[0] === "manage" && parts[1] === "videos") {
    return { id: parts[2], hash: parts[3] ?? hashParam };
  }
  if (parts.length === 4 && parts[0] === "groups" && parts[2] === "videos") return { id: parts[3], hash: hashParam };
  if (parts.length === 4 && (parts[0] === "showcase" || parts[0] === "album") && parts[2] === "video") {
    return { id: parts[3], hash: hashParam };
  }
  return null;
}

/**
 * The embed for a YouTube or Vimeo link, or null for anything else.
 *
 * Always the privacy-preserving player, whichever address was pasted:
 * `www.youtube-nocookie.com`, which sets no cookie until the visitor presses
 * play, and Vimeo's player with `dnt=1`, which tells it not to track the
 * session. LAUNCH_CHECKLIST §7 asks for exactly this, and a link copied from
 * the address bar is never the nocookie one, so leaving it to the author
 * would mean it almost never happened.
 *
 * A YouTube id is exactly eleven characters of `[A-Za-z0-9_-]`, and a Vimeo id
 * is digits. Anything else is refused rather than passed through to the
 * player, where an id is a path segment and `../` in one is a different page
 * of somebody else's site in a frame on the customer's.
 */
export function videoEmbed(src: unknown): VideoEmbed | null {
  const url = parse(src);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host) || YOUTUBE_NOCOOKIE_HOSTS.has(host) || host === YOUTU_BE) {
    const found = youtubeId(url, host, parts);
    // `videoseries` is eleven characters and passes the id test, but in
    // `/embed/videoseries?list=…` it means "the playlist named in the query",
    // which this block does not carry across. Embedded on its own it is a
    // player with nothing in it.
    if (!found || !YOUTUBE_ID.test(found.id) || found.id === "videoseries") return null;
    const start = startTimeOf(url);
    const embedUrl = normalizeEmbed(
      `https://www.youtube-nocookie.com/embed/${found.id}${start ? `?start=${start}` : ""}`,
    );
    return embedUrl ? { provider: "youtube", id: found.id, embedUrl, upright: found.upright } : null;
  }

  if (VIMEO_HOSTS.has(host) || host === VIMEO_PLAYER) {
    const found = vimeoIdAndHash(url, host, parts);
    if (!found || !VIMEO_ID.test(found.id)) return null;
    if (found.hash !== undefined && !VIMEO_HASH.test(found.hash)) return null;
    const query = new URLSearchParams();
    if (found.hash) query.set("h", found.hash);
    query.set("dnt", "1");
    // Vimeo takes a start time only in the fragment, and in the same
    // `1m30s` form its share links write.
    const start = parseStartTime(new URLSearchParams(url.hash.replace(/^#/, "")).get("t"));
    const embedUrl = normalizeEmbed(
      `https://player.vimeo.com/video/${found.id}?${query.toString()}${start ? `#t=${start}s` : ""}`,
    );
    return embedUrl ? { provider: "vimeo", id: found.id, embedUrl, upright: false } : null;
  }

  return null;
}

/**
 * Which video site a link belongs to, whether or not a video could be found
 * in it — so the panel can say "that is a YouTube address, but not one with a
 * video in it" instead of drawing a broken file player and saying nothing.
 * A channel page, a search, a playlist: all of those arrive here, and the
 * block leaves such an address off the page.
 *
 * Only pages, though. Vimeo's paid plans hand out the video itself from the
 * player's host — `player.vimeo.com/external/<id>.hd.mp4?s=…` and
 * `player.vimeo.com/progressive_redirect/playback/<id>/rendition/1080p/…` —
 * and a `<video>` element plays those like any file. This used to answer
 * "vimeo" for the whole host, so an existing block playing one of those
 * files vanished from the published page and the download as soon as the
 * block learned to read Vimeo links. So an address that ends like a video
 * file is a file, whoever serves it, and on the player's host only
 * `/video/…` is a page: the other paths there are files or redirects to one,
 * whether or not the last segment says `.mp4`.
 */
export function videoSiteOf(src: unknown): VideoProvider | null {
  if (looksLikeVideoFile(src)) return null;
  const url = parse(src);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host) || YOUTUBE_NOCOOKIE_HOSTS.has(host) || host === YOUTU_BE) return "youtube";
  if (VIMEO_HOSTS.has(host)) return "vimeo";
  if (host === VIMEO_PLAYER) return url.pathname.split("/").filter(Boolean)[0] === "video" ? "vimeo" : null;
  return null;
}

/**
 * The name a screen reader gives the player.
 *
 * A frame without a title is announced as "frame", which says nothing about
 * what is in it; the author's own words are best, and the provider's name is
 * the least that is still true. A video file is a `<video>` element, which
 * has controls of its own to announce and is given the author's title only
 * when there is one.
 */
export function videoTitle(title: string | undefined, embed: VideoEmbed | null): string | undefined {
  const own = (title ?? "").trim();
  if (own) return own;
  return embed ? `${VIDEO_PROVIDER_NAME[embed.provider]} video` : undefined;
}

/** The host a visitor's browser contacts for the player, for the panel and the privacy audit. */
export function videoEmbedHost(embed: VideoEmbed): string {
  return new URL(embed.embedUrl).hostname;
}

/**
 * The other server a video file is played from, or null for one of this
 * site's own. The panel says which, because a file on somebody else's server
 * is a name in the privacy notice and one in the site's own folder is not —
 * so this has to give the answer `remoteHost` gives the audit, and a test
 * holds the two to it.
 */
export function videoFileHost(src: unknown): string | null {
  return resolveOffSite(src)?.host ?? null;
}

/**
 * The endings a `<video>` element can be expected to play: what the upload
 * route takes, and the three other names the same formats go by.
 */
export const PLAYABLE_VIDEO_EXTENSIONS: readonly string[] = [...VIDEO_EXTENSIONS, "ogv", "mov", "m4v"];

/**
 * Whether an address names a video file by its ending.
 *
 * A page from another video site — Dailymotion, a Loom share, a TikTok — used
 * to be announced in the panel as "a video file from dailymotion.com", and the
 * block then drew a player that could never start. The ending is only a hint
 * (a signed CDN address may have none and still play), so the panel warns
 * rather than refuses.
 */
export function looksLikeVideoFile(src: unknown): boolean {
  if (typeof src !== "string") return false;
  const trimmed = src.trim();
  const url = resolveOffSite(trimmed);
  return PLAYABLE_VIDEO_EXTENSIONS.includes(extensionOf(url ? url.pathname : trimmed));
}
