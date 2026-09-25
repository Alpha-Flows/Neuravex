/**
 * What a page tells a search engine in its own terms: structured data, as
 * schema.org JSON-LD.
 *
 * A search engine reading a bakery's home page had to guess from its words
 * that it was a bakery, where it was and when it could be rung — while the
 * operator had typed all of that, exactly, into the legal details for the
 * Impressum. And an FAQ built from the accordion block was, to a search
 * engine, some text that opened and closed. Both can be said outright.
 *
 * Two descriptions, then. The business, on the home page — only when the
 * operator has said what kind of business it is, since the details it is
 * made from are theirs to publish or not. And the questions and answers of
 * every accordion on a page that are questions, unless the block is told
 * otherwise.
 *
 * The data is plain text throughout: an answer's formatting and links stay on
 * the page, where the export knows how to rewrite them.
 */
import type { AccordionProps, BaseBlock, SocialLink } from "@/types";
import type { LegalProfile } from "./legal/profile";
import { cleanBusinessType, publishesAddress } from "./business-types";

type Json = Record<string, unknown>;

/** Text without its markup or its surplus space, for a value in the data. */
function plain(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Question {
  question: string;
  answer: string;
}

/** The most questions one page gives; past this it is a manual, not an FAQ. */
const MAX_QUESTIONS = 50;

/**
 * The questions and answers on a page: every item of every accordion that
 * has not been told otherwise, whose title ends in a question mark and whose
 * answer says something, in page order.
 */
export function questionsOf(blocks: BaseBlock[]): Question[] {
  const out: Question[] = [];
  const walk = (list: BaseBlock[]) => {
    for (const block of list) {
      if (block.type === "accordion") {
        const props = block.props as AccordionProps;
        if (props.faq !== false) {
          for (const item of props.items ?? []) {
            const question = plain(item?.title);
            const answer = plain(item?.body);
            if (question.endsWith("?") && answer) out.push({ question, answer });
          }
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return out.slice(0, MAX_QUESTIONS);
}

/** A page's questions as an FAQPage, or null when it has none. */
export function faqPage(questions: Question[]): Json | null {
  if (questions.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };
}

export interface BusinessInput {
  /** The site's `businessType`, as stored. */
  type: unknown;
  siteName: string;
  description?: string | null;
  /** The home page's full address. */
  url: string;
  /** Full addresses, when there are pictures to give. */
  logo?: string;
  image?: string;
  legal: LegalProfile;
  /** The footer's profiles, which say where else the business is found. */
  social?: SocialLink[];
}

/**
 * The business as schema.org describes one, or null when the operator has
 * not said what kind it is. The name is the one it trades under, from the
 * legal details, and the site's own when those are empty; the address is
 * given for anything but a person.
 */
export function businessData(input: BusinessInput): Json | null {
  const type = cleanBusinessType(input.type);
  if (!type) return null;
  const { legal } = input;
  const out: Json = {
    "@context": "https://schema.org",
    "@type": type,
    name: plain(legal.companyName) || plain(input.siteName),
    url: input.url,
  };
  const description = plain(input.description);
  if (description) out.description = description;
  if (input.logo) out.logo = input.logo;
  if (input.image) out.image = input.image;

  const a = legal.address;
  if (publishesAddress(type) && (a.street || a.city)) {
    const address: Json = { "@type": "PostalAddress" };
    const street = [a.street, a.extra].map(plain).filter(Boolean).join(", ");
    if (street) address.streetAddress = street;
    if (a.postalCode) address.postalCode = plain(a.postalCode);
    if (a.city) address.addressLocality = plain(a.city);
    if (a.country) address.addressCountry = plain(a.country);
    out.address = address;
  }
  if (legal.phone) out.telephone = plain(legal.phone);
  if (legal.email) out.email = plain(legal.email);

  const profiles = (input.social ?? []).map((s) => s.href).filter((href) => /^https:\/\//i.test(href));
  if (profiles.length) out.sameAs = profiles;
  return out;
}

/**
 * Data as the body of a `<script type="application/ld+json">`. `<`, `>` and
 * `&` are written as escapes, which JSON reads as the same characters and an
 * HTML parser cannot take for the end of the script — a question containing
 * `</script>` would otherwise have closed it and put the rest on the page.
 */
export function jsonLd(data: Json): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
