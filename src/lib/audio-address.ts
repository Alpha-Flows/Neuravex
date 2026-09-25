import { extensionList, extensionOf, mediaKindOf } from "./media-kind";
import { fileNameFromUrl } from "./media";

/**
 * What the audio panel says about an address typed by hand.
 *
 * Worked out from the draft in the field rather than from the block, because
 * the block only takes the address once it is finished (see `AudioPanel`),
 * and a warning that waited for that would arrive after the mistake.
 */

/**
 * Why a typed address may not play, or null when it looks right.
 *
 * Only what can be told from the address itself. An address with no
 * extension is left alone — plenty of hosts serve a recording from a path
 * like `/episodes/42/download` — but one that plainly names a picture or a
 * web page is said so now, rather than found out as a player that never
 * starts.
 */
export function remoteAudioProblem(draft: string): string | null {
  const address = draft.trim();
  if (!address) return null;
  if (!/^https:\/\//i.test(address)) {
    return "An address on the web starts with https:// — a browser will not play an http:// file on a secure page.";
  }
  const ext = extensionOf(address);
  if (ext && mediaKindOf(address) !== "audio") {
    return `That address ends in .${ext}, which is not a sound file. A browser plays ${extensionList("audio")}.`;
  }
  return null;
}

/** "episode-4.mp3 from cdn.example.com", for an address typed by hand. */
export function describeRemoteAudio(src: string): string {
  try {
    const url = new URL(src);
    let file = fileNameFromUrl(url.pathname);
    try {
      file = decodeURIComponent(file);
    } catch {
      // A stray `%` in a hand-typed address; show it as it was typed.
    }
    return file ? `${file} from ${url.host}` : url.host;
  } catch {
    return src;
  }
}
