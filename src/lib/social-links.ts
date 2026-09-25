/**
 * Where a social link goes, written the way people actually write it.
 *
 * Nobody types `https://www.instagram.com/yourname`. They type `@yourname`,
 * or `instagram.com/yourname`, or their email address, or a phone number for
 * WhatsApp — and a link box that stores exactly that publishes a relative
 * link. `@yourname` on the page `/sites/acme` goes to `/sites/@yourname`,
 * which is a 404 on the customer's own site with their own logo above it, and
 * nothing on the canvas says so: the icon looks exactly as it would with the
 * right address behind it.
 *
 * So what was typed is turned into an address here, but only where the answer
 * is not a guess. A bare name under Instagram can only be an Instagram
 * account; a bare name under LinkedIn could be a person or a company, and a
 * phone number starting with a single 0 could be in any country, so those two
 * are left as typed and the inspector says what is missing instead.
 *
 * It is dependency-free on purpose. The inspector calls it when somebody
 * leaves a link box, and `block-tree.ts` at every door a tree comes in by, so
 * an agent writing `hello@example.com` through the MCP server gets the same
 * `mailto:` the inspector would have given it. Nothing here imports more than
 * the URL rule and the table of drawings, both of which the browser already
 * has.
 */

import type { SocialLink, SocialNetwork } from "@/types";
import { isSafeHref } from "./url-safety";
import { SOCIAL_ICONS, socialIcon } from "./social-icons";

/** Enough for every network a person is on, and a finite row to draw. */
export const MAX_SOCIAL_LINKS = 20;

/**
 * The longest address a social link keeps.
 *
 * The first email pattern here could be made to backtrack: an address of
 * `a@`, forty thousand dots and another `@` took three seconds to be turned
 * down, a hundred and sixty thousand took nineteen, and because the schema
 * runs this on every read, a page holding one froze the single server process
 * for every visitor who opened it. The patterns are written so that cannot
 * happen now, and this is the second wall: no profile address is two
 * thousand characters long, so nothing longer is looked at, and the schema
 * does not keep it.
 */
export const MAX_SOCIAL_HREF = 2048;

/**
 * What to type, shown in the empty link box — the short form wherever the
 * short form is finished into an address when the box is left, so the author
 * learns that `@yourname` is enough rather than finding it out by accident.
 */
export const SOCIAL_PLACEHOLDERS: Record<SocialNetwork, string> = {
  instagram: "@yourname or instagram.com/yourname",
  facebook: "yourpage or facebook.com/yourpage",
  x: "@yourname or x.com/yourname",
  linkedin: "linkedin.com/in/yourname",
  youtube: "@yourchannel or youtube.com/@yourchannel",
  tiktok: "@yourname or tiktok.com/@yourname",
  github: "yourname or github.com/yourname",
  mastodon: "@you@mastodon.social",
  bluesky: "you.bsky.social",
  pinterest: "yourname or pinterest.com/yourname",
  threads: "@yourname or threads.com/@yourname",
  whatsapp: "+49 170 1234567",
  email: "you@yourdomain.com",
  website: "https://yourdomain.com",
};

/**
 * The name a network goes by in the inspector's menu, and what a visitor's
 * screen reader hears for its link. The same as the drawing's label, except
 * where the label alone would leave somebody wondering which network is
 * meant: a link read out as "X" says nothing to anybody who has not followed
 * the rename.
 */
export function socialMenuName(network: SocialNetwork): string {
  return network === "x" ? "X (formerly Twitter)" : socialIcon(network).label;
}

/**
 * The domains each network's own addresses live on, so `instagram.com/you`
 * — an address with only its scheme missing — can be finished without asking.
 * Subdomains count: `m.facebook.com` and `www.youtube.com` are the same site.
 */
const NETWORK_HOSTS: Partial<Record<SocialNetwork, string[]>> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  github: ["github.com"],
  bluesky: ["bsky.app"],
  pinterest: ["pinterest.com", "pin.it"],
  threads: ["threads.com", "threads.net"],
  whatsapp: ["wa.me", "whatsapp.com"],
};

/**
 * A handle on its own, per network, and the profile address it stands for.
 *
 * Each pattern is the characters that network allows in a name and no more,
 * so something that is plainly not a handle — a sentence, a half-typed
 * address — falls through and is left alone. LinkedIn is here only in its
 * `in/name` and `company/name` forms, because a bare name there does not say
 * which of the two it is. Mastodon needs its server, because the same name on
 * two servers is two different people.
 */
const HANDLES: Partial<Record<SocialNetwork, (value: string) => string | null>> = {
  instagram: (v) => match(v, /^@?([A-Za-z0-9._]{1,30})$/, (h) => `https://www.instagram.com/${h}`),
  facebook: (v) => match(v, /^@?([A-Za-z0-9.]{1,50})$/, (h) => `https://www.facebook.com/${h}`),
  x: (v) => match(v, /^@?([A-Za-z0-9_]{1,15})$/, (h) => `https://x.com/${h}`),
  linkedin: (v) => {
    const m = /^(in|company|school|showcase)\/([A-Za-z0-9_%.-]+)\/?$/i.exec(v);
    return m ? `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` : null;
  },
  youtube: (v) => match(v, /^@?([A-Za-z0-9._-]{3,30})$/, (h) => `https://www.youtube.com/@${h}`),
  tiktok: (v) => match(v, /^@?([A-Za-z0-9._]{2,24})$/, (h) => `https://www.tiktok.com/@${h}`),
  github: (v) => match(v, /^@?([A-Za-z0-9][A-Za-z0-9-]{0,38})$/, (h) => `https://github.com/${h}`),
  mastodon: (v) => {
    // `@you@mastodon.social` and `you@mastodon.social` are how a Mastodon
    // account is written; `mastodon.social/@you` is its address without the
    // scheme. All three name the same page.
    const account = /^@?([A-Za-z0-9_]{1,30})@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/.exec(v);
    if (account) return `https://${account[2].toLowerCase()}/@${account[1]}`;
    const address = /^([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\/@([A-Za-z0-9_]{1,30})\/?$/.exec(v);
    return address ? `https://${address[1].toLowerCase()}/@${address[2]}` : null;
  },
  bluesky: (v) =>
    // A Bluesky handle is a domain name — `you.bsky.social`, or your own —
    // so it has at least one dot. A bare word has none and is not a handle.
    match(v, /^@?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/, (h) => `https://bsky.app/profile/${h}`),
  pinterest: (v) => match(v, /^@?([A-Za-z0-9_]{3,30})$/, (h) => `https://www.pinterest.com/${h}`),
  threads: (v) => match(v, /^@?([A-Za-z0-9._]{1,30})$/, (h) => `https://www.threads.com/@${h}`),
};

function match(value: string, pattern: RegExp, url: (handle: string) => string): string | null {
  const m = pattern.exec(value);
  return m ? url(m[1]) : null;
}

/** A scheme, a path, a fragment or a query: something that is already an address. */
function isAddress(value: string): boolean {
  return hasScheme(value) || /^[#/?]/.test(value) || /^\.\.?\//.test(value);
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * An email address with nothing in front of it.
 *
 * Every part of the pattern stops at a character the next part starts with —
 * the name at `@`, each label of the domain at `.` — so there is only one way
 * to read any address and the pattern never has to go back and try another.
 * The first version let the domain swallow dots, and an address made of dots
 * took seconds to refuse (see `MAX_SOCIAL_HREF`).
 */
export function isBareEmail(value: string): boolean {
  return /^[^\s@/:?#]+@[^\s@/:?#.]+(?:\.[^\s@/:?#.]+)+(?:\?\S*)?$/.test(value);
}

/**
 * A phone number as WhatsApp's `wa.me` wants it: the full international
 * number, digits only. `+49 170 …` and `0049 170 …` say their country; a
 * number with no prefix at all is taken to be international already, because
 * that is the form WhatsApp itself shows. A single leading 0 is a national
 * number, and which nation is exactly what cannot be guessed.
 */
function whatsappNumber(value: string): string | null {
  if (!/^\+?[\d\s().\-/]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+")) return digits.length >= 7 && digits.length <= 15 ? digits : null;
  if (digits.startsWith("00")) return digits.length - 2 >= 7 && digits.length - 2 <= 15 ? digits.slice(2) : null;
  if (digits.startsWith("0")) return null;
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/**
 * What was typed into a social link's box, as an address — or exactly what
 * was typed, when there is no answer that is not a guess.
 *
 * Anything that already has a scheme, or is a path, is returned as it is,
 * and so is a fragment unless it was a handle with a `#` in front. That makes
 * this safe to run twice and safe to run on every read: everything it
 * produces starts with a scheme. It never decides what is safe to link to;
 * `isSafeHref` does that afterwards, on whatever this returns. Nothing longer
 * than `MAX_SOCIAL_HREF` is read at all.
 */
export function normaliseSocialHref(network: SocialNetwork, raw: string): string {
  if (raw.length > MAX_SOCIAL_HREF) return raw;
  const value = raw.trim();

  // A new link used to start as `#`, and typing into the box put the caret
  // after it: `@acme` was stored as `#@acme`, a link to a spot on the page
  // that does not exist, drawn as a working Instagram icon. The `#` comes off
  // whenever what follows it can be finished into an address — except for a
  // website link, where `#contact` is a real link to a real spot.
  if (value.startsWith("#") && network !== "website") {
    const rest = value.replace(/^#+/, "").trim();
    const finished = rest && !rest.startsWith("#") ? normaliseSocialHref(network, rest) : "";
    return hasScheme(finished) ? finished : value;
  }

  if (!value || isAddress(value)) return value;

  if (network === "email") return isBareEmail(value) ? `mailto:${value}` : value;

  if (network === "whatsapp") {
    const number = whatsappNumber(value);
    if (number) return `https://wa.me/${number}`;
  }

  // An address with only the scheme left off: the network's own domain, or
  // anything written from `www.` on, which only ever names a website.
  const hosts = NETWORK_HOSTS[network] ?? [];
  const host = /^([^/?#\s]+)/.exec(value)?.[1].toLowerCase() ?? "";
  if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return `https://${value}`;
  if (/^www\.[^/?#\s]+\.[a-z]{2,}(?:[/?#]|$)/i.test(value)) return `https://${value}`;

  return HANDLES[network]?.(value) ?? value;
}

/**
 * The address a link is drawn with, or "" when it has none worth publishing.
 *
 * `#` is the empty value, not a link: it is what a new block starts with, the
 * way a new button does, and an icon that goes nowhere is a promise the page
 * does not keep. Checked again here as well as at the door, because this is
 * the value that becomes `href` in a file with no CSP behind it.
 */
export function socialHref(link: Pick<SocialLink, "href"> | null | undefined): string {
  const raw = link?.href;
  if (typeof raw !== "string" || raw.length > MAX_SOCIAL_HREF) return "";
  const href = isSafeHref(raw);
  // Only something that is already an address. What could not be finished —
  // a LinkedIn name on its own, `hello` under Email — is a relative link as
  // it stands: `jane-doe` on `/sites/acme` goes to `/sites/jane-doe`, which is
  // a 404 or, worse, another of the customer's own sites. Left out here, it
  // is faded on the canvas and missing from the page, and the inspector says
  // why.
  return href && href !== "#" && isAddress(href) ? href : "";
}

/**
 * The `rel` a profile link carries.
 *
 * `me` says "this profile is also me". Mastodon reads it to put a verified
 * tick beside the website on the author's profile — it fetches the site and
 * looks for a `rel="me"` link back — and IndieWeb sign-in reads it the same
 * way. A chat link, an email address or a page of the site itself is not a
 * profile, so it gets none. Nothing else is added, because nothing else is
 * needed: these links open where they are, the way every other link on a
 * Neuravex page does, so there is no `target` for `noopener` to guard.
 */
export function socialRel(network: SocialNetwork, href: string): string | undefined {
  return network !== "whatsapp" && /^https?:\/\//i.test(href) ? "me" : undefined;
}

/**
 * The network an address belongs to, when it plainly belongs to one: a
 * profile on that network's own domain, a `wa.me` chat, a `mailto:`.
 * Mastodon has no domain of its own, so it is never the answer.
 */
export function socialAddressNetwork(href: string): SocialNetwork | null {
  const value = (href ?? "").trim();
  if (value.length > MAX_SOCIAL_HREF) return null;
  if (/^mailto:/i.test(value)) return "email";
  const host = /^https?:\/\/([^/?#\s:@]+)/i.exec(value)?.[1].toLowerCase();
  if (!host) return null;
  for (const [network, hosts] of Object.entries(NETWORK_HOSTS) as [SocialNetwork, string[]][]) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return network;
  }
  return null;
}

/**
 * The names set aside for examples (RFC 2606 and 6761). An address on one of
 * them was copied from a placeholder, never somebody's own — a page that went
 * out with `hello@example.com` under its envelope sent every visitor's email
 * nowhere.
 */
function isExampleAddress(href: string): boolean {
  const host = /^https?:\/\/([^/?#\s:@]+)/i.exec(href)?.[1] ?? /^mailto:[^@?]*@([^?#\s]+)/i.exec(href)?.[1];
  if (!host) return false;
  const name = host.toLowerCase().replace(/\.$/, "");
  return (
    /(?:^|\.)example\.(?:com|net|org)$/.test(name) ||
    /(?:^|\.)(?:example|test|invalid|localhost)$/.test(name)
  );
}

/**
 * What the inspector should say about one link, or null when it is fine.
 *
 * The canvas shows every icon whatever is behind it, so this is the only
 * place an author finds out that a link is missing or will not work — before
 * a visitor does.
 */
export function socialHrefProblem(network: SocialNetwork, href: string): string | null {
  const value = (href ?? "").trim();
  if (!value || value === "#") return "Visitors will not see this icon until it has an address.";
  // Judged as it will be stored, so `@you` half-way through being typed under
  // Instagram is not scolded for a problem leaving the box will fix.
  if (value.length > MAX_SOCIAL_HREF) return "That address is far too long to be a profile, so the icon will be left out.";
  const finished = normaliseSocialHref(network, value);
  if (isSafeHref(finished) === undefined) return "That kind of address cannot be linked to, so the icon will be left out.";
  if (finished.startsWith("#") && network !== "website") {
    return "This links to a spot on this page, not to a profile. If that is not what you meant, take the # off the front.";
  }
  if (isAddress(finished)) {
    if (isExampleAddress(finished)) return "That is a placeholder address, not a real one — put your own in its place.";
    const owner = socialAddressNetwork(finished);
    if (owner && owner !== network) {
      return owner === "email"
        ? `That is an email address, but this icon is ${socialMenuName(network)}.`
        : `That address is on ${socialMenuName(owner)}, but this icon is ${socialMenuName(network)}.`;
    }
    return null;
  }
  if (network === "whatsapp" && /^\+?[\d\s().\-/]+$/.test(value)) {
    return "Write the whole number with its country code — +49 for Germany, +44 for the UK — so WhatsApp can find it.";
  }
  if (network === "email") return "Write the whole email address, like hello@example.com.";
  if (network === "linkedin") {
    return "Write the whole address: a name on its own could be a person or a company.";
  }
  if (network === "mastodon") {
    return "Write the whole address, or the account with its server: @you@mastodon.social.";
  }
  return "This is not a full address yet, so it would lead to a missing page on your own site. Start it with https://.";
}

/** The first network in the menu that this block does not link to yet. */
export function nextSocialNetwork(links: SocialLink[]): SocialNetwork {
  const used = new Set(links.map((l) => l.network));
  const networks = Object.keys(SOCIAL_ICONS) as SocialNetwork[];
  return networks.find((n) => !used.has(n)) ?? "website";
}
