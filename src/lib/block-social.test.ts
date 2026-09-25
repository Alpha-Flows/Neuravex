import { describe, it, expect } from "vitest";
import { normalizeBlockTree, SOCIAL_NETWORKS } from "@/lib/block-tree";
import { BLOCKS } from "@/lib/blocks";
import { SOCIAL_ICONS, socialIcon } from "@/lib/social-icons";
import {
  MAX_SOCIAL_HREF,
  MAX_SOCIAL_LINKS,
  SOCIAL_PLACEHOLDERS,
  isBareEmail,
  nextSocialNetwork,
  normaliseSocialHref,
  socialAddressNetwork,
  socialHref,
  socialHrefProblem,
  socialMenuName,
  socialRel,
} from "@/lib/social-links";
import { movePath, retargetLinks } from "@/lib/page-links";
import { auditSite } from "@/lib/legal/audit";
import type { BaseBlock, SocialNetwork, SocialProps } from "@/types";

const social = (props: Record<string, unknown>): BaseBlock =>
  ({ id: "s1", type: "social", props }) as BaseBlock;

function stored(props: Record<string, unknown>): SocialProps {
  const result = normalizeBlockTree([social(props)]);
  if (!result.ok) throw new Error(result.error);
  return result.tree[0].props as SocialProps;
}

describe("the social block's schema", () => {
  it("keeps a well-formed row exactly as it was", () => {
    const props = {
      links: [
        { network: "instagram", href: "https://www.instagram.com/acme" },
        { network: "email", href: "mailto:hello@acme.test" },
      ],
      size: "lg",
      shape: "square",
      color: "#ff0066",
      align: "center",
    };
    expect(stored(props)).toEqual(props);
  });

  it("reads a network it does not know as a website, rather than losing the link", () => {
    const out = stored({ links: [{ network: "myspace", href: "https://myspace.test/acme" }] });
    expect(out.links).toEqual([{ network: "website", href: "https://myspace.test/acme" }]);
  });

  it("empties an href that would run something", () => {
    for (const href of ["javascript:alert(1)", "java\u0000script:alert(1)", " JAVASCRIPT:alert(1)", "data:text/html,<script>x</script>", "vbscript:x"]) {
      expect(stored({ links: [{ network: "website", href }] }).links[0].href).toBe("");
    }
  });

  it("empties an href that is not a string", () => {
    expect(stored({ links: [{ network: "github", href: { toString: "x" } }] }).links[0].href).toBe("");
    expect(stored({ links: [{ network: "github" }] }).links[0].href).toBe("");
  });

  it("cuts a long row to twenty links, keeping the first twenty", () => {
    const links = Array.from({ length: 35 }, (_, i) => ({ network: "website", href: `https://example.test/${i}` }));
    const out = stored({ links });
    expect(MAX_SOCIAL_LINKS).toBe(20);
    expect(out.links).toHaveLength(20);
    expect(out.links[0].href).toBe("https://example.test/0");
    expect(out.links[19].href).toBe("https://example.test/19");
  });

  it("drops an entry that is not a link and keeps the rest", () => {
    const out = stored({ links: [null, "instagram", 7, { network: "x", href: "https://x.com/acme" }] });
    expect(out.links).toEqual([{ network: "x", href: "https://x.com/acme" }]);
  });

  it("repairs a missing or mistyped setting rather than refusing the block", () => {
    const out = stored({ links: "not a list", size: "huge", shape: "hexagon", align: "middle", color: "red; background: url(//x)" });
    expect(out).toEqual({ links: [], size: "md", shape: "circle", align: "left", color: "" });
  });

  it("finishes an address typed without its scheme, as the inspector would have", () => {
    // What an agent writing through the MCP server is likely to send.
    const out = stored({
      links: [
        { network: "email", href: "hello@acme.test" },
        { network: "instagram", href: "@acme" },
        { network: "whatsapp", href: "+49 170 1234567" },
        { network: "linkedin", href: "acme" },
      ],
    });
    expect(out.links.map((l) => l.href)).toEqual([
      "mailto:hello@acme.test",
      "https://www.instagram.com/acme",
      "https://wa.me/491701234567",
      // A bare name on LinkedIn could be a person or a company: left alone.
      "acme",
    ]);
  });

  it("gives the same answer the second time it reads a row", () => {
    const once = stored({
      links: [
        { network: "mastodon", href: "@you@mastodon.social" },
        { network: "bluesky", href: "you.bsky.social" },
        { network: "website", href: "www.acme.test" },
      ],
    });
    expect(stored(once as unknown as Record<string, unknown>)).toEqual(once);
  });

  it("stores the block's defaults unchanged", () => {
    const defaults = BLOCKS.find((b) => b.type === "social")!.defaultProps;
    expect(stored(defaults)).toEqual(defaults);
  });

  it("publishes nothing from a block nobody has filled in", () => {
    // It used to start with mailto:hello@example.com, and a block dropped in
    // and published as it came sent visitors' email to an example domain.
    const defaults = BLOCKS.find((b) => b.type === "social")!.defaultProps as SocialProps;
    expect(defaults.links.length).toBeGreaterThan(0);
    for (const link of defaults.links) expect(socialHref(link)).toBe("");
  });

  it("does not keep an address longer than any profile's", () => {
    const long = `https://www.instagram.com/${"a".repeat(MAX_SOCIAL_HREF)}`;
    expect(stored({ links: [{ network: "instagram", href: long }] }).links[0].href).toBe("");
    const fits = `https://www.instagram.com/${"a".repeat(MAX_SOCIAL_HREF - 26)}`;
    expect(fits).toHaveLength(MAX_SOCIAL_HREF);
    expect(stored({ links: [{ network: "instagram", href: fits }] }).links[0].href).toBe(fits);
  });
});

describe("an address built to be slow", () => {
  // `a@`, then dots, then `@`, under Email: the first email pattern tried
  // every way of splitting the dots between the domain's labels. Forty
  // thousand of them took 3.1 seconds, and every later read of the page paid
  // it again.
  const dots = (n: number) => `a@${".".repeat(n)}@`;

  function timed(run: () => unknown): number {
    const start = performance.now();
    run();
    return performance.now() - start;
  }

  it("is refused quickly by the email pattern itself, at two megabytes", () => {
    for (const value of [dots(2_000_000), `a@${"a".repeat(2_000_000)}`, `a@b${".c".repeat(20_000)}.`]) {
      let result: boolean | undefined;
      expect(timed(() => (result = isBareEmail(value)))).toBeLessThan(100);
      expect(result).toBe(false);
    }
  });

  it("is not read at all past the length a profile address can have", () => {
    for (const n of [40_000, 2_000_000]) {
      const href = dots(n);
      expect(timed(() => expect(normaliseSocialHref("email", href)).toBe(href))).toBeLessThan(100);
      expect(timed(() => socialHrefProblem("email", href))).toBeLessThan(100);
      expect(timed(() => socialHref({ href }))).toBeLessThan(100);
    }
  });

  it("is emptied by the schema, quickly, rather than stored to be read again", () => {
    for (const n of [40_000, 2_000_000]) {
      const links = [{ network: "email", href: dots(n) }];
      let out: SocialProps | undefined;
      expect(timed(() => (out = stored({ links })))).toBeLessThan(100);
      expect(out!.links[0].href).toBe("");
    }
  });

  it("takes no network's patterns long, at the longest address that is read", () => {
    const shapes = [
      (n: number) => `a@${".".repeat(n)}@`,
      (n: number) => `www.${"a.".repeat(n)}!`,
      (n: number) => `@${"a".repeat(n)}@`,
      (n: number) => `${"a-".repeat(n)}.`,
      (n: number) => `+${"1 ".repeat(n)}x`,
      (n: number) => `in/${"a".repeat(n)}//`,
      (n: number) => `#${"#".repeat(n)}a`,
      (n: number) => `mailto:${"a".repeat(n)}@${"b.".repeat(n)}`,
    ];
    for (const network of SOCIAL_NETWORKS) {
      for (const shape of shapes) {
        const value = shape(MAX_SOCIAL_HREF).slice(0, MAX_SOCIAL_HREF);
        expect(timed(() => {
          normaliseSocialHref(network, value);
          socialHrefProblem(network, value);
        }), `${network} ${value.slice(0, 12)}`).toBeLessThan(50);
      }
    }
  });
});

describe("finishing what was typed into a link box", () => {
  const cases: [SocialNetwork, string, string][] = [
    ["email", "hello@example.com", "mailto:hello@example.com"],
    ["email", "  hello@example.com  ", "mailto:hello@example.com"],
    ["email", "mailto:hello@example.com", "mailto:hello@example.com"],
    ["email", "hello", "hello"],
    ["whatsapp", "+49 170 1234567", "https://wa.me/491701234567"],
    ["whatsapp", "+1 (555) 010-9999", "https://wa.me/15550109999"],
    ["whatsapp", "0049 170 1234567", "https://wa.me/491701234567"],
    ["whatsapp", "491701234567", "https://wa.me/491701234567"],
    // A national number: which country is the one thing not written down.
    ["whatsapp", "0170 1234567", "0170 1234567"],
    ["whatsapp", "wa.me/491701234567", "https://wa.me/491701234567"],
    ["instagram", "@acme.studio", "https://www.instagram.com/acme.studio"],
    ["instagram", "acme", "https://www.instagram.com/acme"],
    ["instagram", "instagram.com/acme", "https://instagram.com/acme"],
    ["instagram", "www.instagram.com/acme", "https://www.instagram.com/acme"],
    ["facebook", "m.facebook.com/acme", "https://m.facebook.com/acme"],
    ["x", "@acme", "https://x.com/acme"],
    ["x", "twitter.com/acme", "https://twitter.com/acme"],
    ["youtube", "@acme", "https://www.youtube.com/@acme"],
    ["tiktok", "@acme", "https://www.tiktok.com/@acme"],
    ["github", "acme-co", "https://github.com/acme-co"],
    ["threads", "@acme", "https://www.threads.com/@acme"],
    ["pinterest", "acme", "https://www.pinterest.com/acme"],
    ["bluesky", "@you.bsky.social", "https://bsky.app/profile/you.bsky.social"],
    ["bluesky", "acme.test", "https://bsky.app/profile/acme.test"],
    // A Bluesky handle is a domain; a bare word is not one.
    ["bluesky", "you", "you"],
    ["mastodon", "@you@mastodon.social", "https://mastodon.social/@you"],
    ["mastodon", "you@Fosstodon.org", "https://fosstodon.org/@you"],
    ["mastodon", "mastodon.social/@you", "https://mastodon.social/@you"],
    // A name with no server could be anybody's.
    ["mastodon", "you", "you"],
    ["linkedin", "in/jane-doe", "https://www.linkedin.com/in/jane-doe"],
    ["linkedin", "company/acme", "https://www.linkedin.com/company/acme"],
    ["linkedin", "jane-doe", "jane-doe"],
    ["website", "www.acme.test", "https://www.acme.test"],
    // Could be a domain, could be a file name: not a guess worth making.
    ["website", "acme.test", "acme.test"],
    ["website", "/sites/acme/about", "/sites/acme/about"],
    ["website", "#contact", "#contact"],
    ["website", "", ""],
    // The `#` a new link used to start with, and the caret after it.
    ["instagram", "#@acme", "https://www.instagram.com/acme"],
    ["email", "#hello@acme.studio", "mailto:hello@acme.studio"],
    ["x", "#https://x.com/acme", "https://x.com/acme"],
    // Nothing after the `#` that could be finished: left as the fragment.
    ["email", "#contact", "#contact"],
    ["linkedin", "#jane-doe", "#jane-doe"],
    ["instagram", "#", "#"],
    // Not this function's call to refuse — isSafeHref does that — but it
    // must not dress one up as something else either.
    ["instagram", "javascript:alert(1)", "javascript:alert(1)"],
  ];

  it.each(cases)("%s: %j → %j", (network, typed, expected) => {
    expect(normaliseSocialHref(network, typed)).toBe(expected);
  });

  it("changes nothing the second time", () => {
    for (const [network, typed] of cases) {
      const once = normaliseSocialHref(network, typed);
      expect(normaliseSocialHref(network, once)).toBe(once);
    }
  });

  it("only ever adds a scheme the link rule allows", () => {
    for (const [network, typed] of cases) {
      const out = normaliseSocialHref(network, typed);
      if (out === typed.trim()) continue;
      expect(out).toMatch(/^(https:\/\/|mailto:)/);
    }
  });
});

describe("what the inspector says about a link", () => {
  it("says a link with no address will not be shown", () => {
    expect(socialHrefProblem("instagram", "")).toMatch(/until it has an address/);
    expect(socialHrefProblem("instagram", "#")).toMatch(/until it has an address/);
  });

  it("is quiet about a handle that leaving the box will finish", () => {
    expect(socialHrefProblem("instagram", "@acme")).toBeNull();
    expect(socialHrefProblem("whatsapp", "+49 170 1234567")).toBeNull();
    expect(socialHrefProblem("website", "/sites/acme/about")).toBeNull();
    expect(socialHrefProblem("email", "mailto:hello@acme.studio")).toBeNull();
    expect(socialHrefProblem("instagram", "#@acme")).toBeNull();
  });

  it("says a # on a profile link makes it a link to this page", () => {
    expect(socialHrefProblem("email", "#contact")).toMatch(/spot on this page/);
    expect(socialHrefProblem("website", "#contact")).toBeNull();
  });

  it("says when an address is a placeholder rather than somebody's own", () => {
    for (const href of [
      "mailto:hello@example.com",
      "https://example.org/you",
      "https://shop.example.com",
      "https://acme.test",
      "mailto:you@site.invalid",
      "https://www.example",
    ]) {
      expect(socialHrefProblem("website", href), href).toMatch(/placeholder/);
    }
    for (const href of ["https://examples.com", "https://myexample.com", "mailto:hello@acme.studio"]) {
      expect(socialHrefProblem("website", href) ?? "", href).not.toMatch(/placeholder/);
    }
  });

  it("says when an address belongs to another network than the icon", () => {
    expect(socialHrefProblem("x", "https://www.instagram.com/acme")).toBe(
      "That address is on Instagram, but this icon is X (formerly Twitter).",
    );
    expect(socialHrefProblem("instagram", "mailto:hello@acme.studio")).toMatch(/email address, but this icon is Instagram/);
    expect(socialHrefProblem("website", "https://github.com/acme")).toMatch(/on GitHub/);
    expect(socialHrefProblem("x", "https://twitter.com/acme")).toBeNull();
    expect(socialHrefProblem("mastodon", "https://mastodon.social/@acme")).toBeNull();
  });

  it("asks for what cannot be guessed", () => {
    expect(socialHrefProblem("whatsapp", "0170 1234567")).toMatch(/country code/);
    expect(socialHrefProblem("linkedin", "jane-doe")).toMatch(/person or a company/);
    expect(socialHrefProblem("mastodon", "you")).toMatch(/server/);
    expect(socialHrefProblem("email", "hello")).toMatch(/email address/);
    expect(socialHrefProblem("website", "acme.test")).toMatch(/https:\/\//);
    expect(socialHrefProblem("website", "javascript:alert(1)")).toMatch(/cannot be linked/);
  });
});

describe("drawing a link", () => {
  it("names the network an address belongs to, where it plainly belongs to one", () => {
    expect(socialAddressNetwork("https://m.facebook.com/acme")).toBe("facebook");
    expect(socialAddressNetwork("https://wa.me/491701234567")).toBe("whatsapp");
    expect(socialAddressNetwork("mailto:hello@acme.studio")).toBe("email");
    expect(socialAddressNetwork("https://notinstagram.com/acme")).toBeNull();
    expect(socialAddressNetwork("https://mastodon.social/@acme")).toBeNull();
    expect(socialAddressNetwork("/sites/acme/about")).toBeNull();
  });

  it("reads X out by its old name too", () => {
    expect(socialMenuName("x")).toBe("X (formerly Twitter)");
    expect(socialMenuName("github")).toBe("GitHub");
  });

  it("draws nothing that is not an address — what was typed and could not be finished", () => {
    // As a relative link, `jane-doe` on /sites/acme is /sites/jane-doe: a
    // 404, or another of the customer's own sites.
    for (const href of ["jane-doe", "hello", "acme.studio", "about.html"]) {
      expect(socialHref({ href }), href).toBe("");
    }
    expect(socialHref({ href: "/sites/acme/about" })).toBe("/sites/acme/about");
    expect(socialHref({ href: "mailto:hello@acme.studio" })).toBe("mailto:hello@acme.studio");
    expect(socialHref({ href: "tel:+491701234567" })).toBe("tel:+491701234567");
  });

  it("has no address to draw for an empty link, a bare # or an unsafe one", () => {
    expect(socialHref({ href: "" })).toBe("");
    expect(socialHref({ href: "#" })).toBe("");
    expect(socialHref({ href: "javascript:alert(1)" })).toBe("");
    expect(socialHref(null)).toBe("");
    expect(socialHref({ href: "https://x.com/acme" })).toBe("https://x.com/acme");
    expect(socialHref({ href: "#team" })).toBe("#team");
  });

  it("marks a profile with rel=me, and nothing that is not one", () => {
    expect(socialRel("mastodon", "https://mastodon.social/@you")).toBe("me");
    expect(socialRel("website", "https://acme.test")).toBe("me");
    expect(socialRel("whatsapp", "https://wa.me/491701234567")).toBeUndefined();
    expect(socialRel("email", "mailto:hello@acme.test")).toBeUndefined();
    expect(socialRel("website", "/sites/acme/about")).toBeUndefined();
  });

  it("has a drawing for every network the schema allows, and none it does not", () => {
    expect(Object.keys(SOCIAL_ICONS).sort()).toEqual([...SOCIAL_NETWORKS].sort());
    for (const network of SOCIAL_NETWORKS) {
      const icon = SOCIAL_ICONS[network];
      expect(icon.label, network).toBeTruthy();
      expect(icon.viewBox, network).toBe("0 0 24 24");
      // Path data and nothing else: it is written into the page as an
      // attribute, so a stray quote or bracket here would be markup.
      expect(icon.path, network).toMatch(/^[MmZzLlHhVvCcSsQqTtAa0-9.,\s-]+$/);
      expect(SOCIAL_PLACEHOLDERS[network], network).toBeTruthy();
    }
  });

  it("draws a network it does not know as the globe", () => {
    expect(socialIcon("myspace")).toBe(SOCIAL_ICONS.website);
  });

  it("offers a network the block does not link to yet when a link is added", () => {
    expect(nextSocialNetwork([])).toBe("instagram");
    expect(nextSocialNetwork([{ network: "instagram", href: "" }, { network: "facebook", href: "" }])).toBe("x");
  });
});

describe("a social link to a page of the same site", () => {
  it("moves with the page when the page is renamed", () => {
    const block = social({
      links: [
        { network: "website", href: "/sites/acme/about#team" },
        { network: "instagram", href: "https://www.instagram.com/acme" },
      ],
    });
    const { blocks, changed } = retargetLinks([block], movePath("/sites/acme/about", "/sites/acme/story"));
    expect(changed).toBe(1);
    expect(blocks[0].props.links).toEqual([
      { network: "website", href: "/sites/acme/story#team" },
      { network: "instagram", href: "https://www.instagram.com/acme" },
    ]);
  });

  it("leaves a block with nothing to move untouched", () => {
    const block = social({ links: [{ network: "x", href: "https://x.com/acme" }] });
    const { blocks, changed } = retargetLinks([block], movePath("/sites/acme/about", "/sites/acme/story"));
    expect(changed).toBe(0);
    expect(blocks[0]).toBe(block);
  });
});

describe("the privacy audit and a row of profile links", () => {
  it("lists each profile as an outbound link, never as something the page loads", () => {
    const block = social({
      links: [
        { network: "instagram", href: "https://www.instagram.com/acme" },
        { network: "mastodon", href: "https://mastodon.social/@acme" },
        { network: "email", href: "mailto:hello@acme.test" },
        { network: "website", href: "/sites/acme/about" },
        { network: "x", href: "#" },
      ],
    });
    const audit = auditSite({ pages: [{ title: "Home", content: JSON.stringify([{ ...block, children: [] }]) }] });
    expect(audit.linkHosts).toEqual(["mastodon.social", "www.instagram.com"]);
    expect(audit.remoteHosts).toEqual([]);
    expect(audit.selfContained).toBe(true);
    expect(audit.findings.every((f) => f.kind === "outbound-link" && !f.needsConsent)).toBe(true);
  });

  it("finds them inside a footer section too", () => {
    const footer = {
      id: "f",
      type: "section",
      props: { background: "#0b0f1e" },
      children: [social({ links: [{ network: "github", href: "https://github.com/acme" }] })],
    };
    const audit = auditSite({ pages: [{ title: "Home", content: JSON.stringify([footer]) }] });
    expect(audit.linkHosts).toEqual(["github.com"]);
    expect(audit.selfContained).toBe(true);
  });
});
