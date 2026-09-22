# Neuravex — Launch Checklist

What has to be true before Neuravex is announced as something people download and run.
First written against `main` at `8e56c06` (20 September 2026) alongside the
[security review](./SECURITY_REVIEW.md); every state below was re-verified against `main` at
`3040006` (22 September 2026). Where a line rests on a finding in the review, the finding's id
(`NVX-…`) is given so the two documents stay in step.

## How to read this

- Every line is something a person can tick. Each carries its **state today** and the
  evidence for that state, so the list is a record of where the project is, not a wish list.
- **Blocker** means shipping without it would harm or embarrass a customer on day one.
  **Should** means a first release ought to have it. **Nice** is worth doing when there is
  time.
- States: ☐ open (missing or only partly there) · ☑ done, verified in this repository · ? not determined.
- A ☐ whose *Today:* line begins **Partly:** is one where most of the work has landed. The
  sentence names what is left, not what was never started.

## What Neuravex is, for the purpose of this list

Neuravex is software a person downloads and runs on their own PC. It is not hosted, it has no
accounts, and the sites it builds leave it as a folder of plain HTML that the customer hosts
elsewhere. Those three facts (from `docs/PRODUCT_REVIEW.md` §0 and `README.md`) decide what
"launch" means here: a working first run on a clean machine, an honest description of what the
software does and does not do, a safe default for a program that has no sign-in, and a way for
the customer to keep their data across updates.

---

## 0. The short list

Everything below the line is the full checklist. These are the items that, unfixed, would hurt a
customer in the first week. They are ordered by how likely a customer is to hit them.

| # | Blocker | State | Why it blocks |
| --- | --- | --- | --- |
| 1 | Uploads made while the app runs answer 404 until restart (NVX-005) | ☑ | Done. `/uploads/*` is a route handler (`src/app/uploads/[name]/route.ts:36`) reading from outside `public/`, and the browser suite now runs against `next start`, so the case is covered rather than invisible. |
| 2 | `npm run desktop` and `npm run start` listen on every network interface (NVX-003) | ☑ | Done. `serverHost()` (`scripts/local-bin.js:43`) defaults to `127.0.0.1` for the launcher and `npm run start`, with a loud opt-out, and the Docker line publishes to loopback. |
| 3 | Next.js is two patches behind a public denial-of-service fix, and the 14.x line has ended (NVX-010, NVX-004) | ☑ | Done. The patch bump landed first; the 16.x migration followed, with React 19, the async request APIs, `middleware` renamed to `proxy` and `next lint` replaced by the ESLint CLI. `npm audit --omit=dev` reports nothing at all against what ships — it was 13 advisories, 1 of them critical. |
| 4 | A link written by an import, a paste or the MCP server runs as script on the customer's exported site (NVX-001), and the same content can lock the owner out of the editor (NVX-045) | ☑ | Done. `isSafeHref()` guards every write path and the render, exported pages carry `EXPORT_CSP` (`src/lib/static-export.ts:164`), and the sanitiser prefixes every `id` so no content can name itself `__next_f`. |
| 5 | Anyone who can reach the port can fill the memory or the disk: bodies are buffered before any size check, submissions have no rate or count limit, block trees have no depth limit (NVX-016 to NVX-019, NVX-013 to NVX-015) | ☐ | Mostly closed — one streaming body cap, a submission rate and count limit, depth/node/byte limits and an iterative CSS scanner all shipped. Three routes still parse an uncapped body and saved blocks still bypass the shared tree schema. See §1. |
| 6 | `git pull && npm run desktop` does not rebuild, although `INSTALL.md` says it does | ☑ | Done. The launcher compares the source against a fingerprint recorded at the last build and rebuilds when it has moved, so an update can no longer serve the old bundle against a migrated database. |
| 7 | The Docker example in `INSTALL.md` cannot build and would be insecure if it could (NVX-011) | ☑ | Done. A tested multi-stage `Dockerfile` with a `.dockerignore`, a non-root user, the schema applied on boot and loopback publishing. |
| 8 | The `Datenschutzerklärung` the app writes makes claims the operator never confirmed (NVX-040), misses trackers in rich text (NVX-021), and has not been reviewed by a qualified person; the exported contact form leaks its answers into the URL (NVX-020) | ☐ | The code findings are all fixed. What remains needs a person: no qualified review, and no "Beta" label while there is none. |
| 9 | There is no release: no tag, no changelog, no version anyone can name, a placeholder clone URL and an unfilled licence owner | ☐ | Partly: `CHANGELOG.md` exists and the licence owner is filled. Still no tag, no release workflow, and `INSTALL.md:72` still says `YOUR_USERNAME`. |

---

## 1. Security

The state column says what the repository does today; the security review holds the evidence.

### Blockers

- ☑ **Blocker** — The launcher and the `start` script bind to `127.0.0.1` unless the operator opts out. *Today:* done. `serverHost()` (`scripts/local-bin.js:43`) is the single source, with `exposureWarning()` at `:49` for the opt-out; used by `electron/server.js:161` and `scripts/start.js:24`, and `Dockerfile:16` publishes `-p 127.0.0.1:3000:3000`. (NVX-003)
- ☑ **Blocker** — The server refuses requests for hostnames it does not serve, so DNS rebinding cannot turn an attacker's page into a same-origin client. *Today:* done. `isServableHost()` (`src/proxy.ts:62`) is applied to every method before anything else (`:157`) and answers 421 (`:218`); covered by `src/proxy.test.ts:62-88`, `GET` included. (NVX-002)
- ☑ **Blocker** — `next` is at 16.3.5, on React 19, and the migration was gated by the full test suite. *Today:* done. The RSC deserialisation DoS and the Windows RCE are both closed at the source rather than mitigated; `images.unoptimized: true` stays because nothing here uses the optimizer, and `sharp` is still absent. (NVX-010, NVX-004)
- ☑ **Blocker** — Link and media URLs in block props are validated on every write path and at render, and exported pages carry a meta CSP. *Today:* done. `isSafeHref()` (`src/lib/url-safety.ts:23`) guards button hrefs (`src/lib/block-tree.ts:137`) and media sources (`:71`) on the way in and at render (`src/components/blocks/BlockView.tsx:51`); every exported page carries `EXPORT_CSP` (`src/lib/static-export.ts:164`). (NVX-001)
- ☑ **Blocker** — Request bodies are read with a hard cap before parsing, form submissions are rate- and count-limited, and block trees are schema-, depth- and size-validated on the editor, PATCH, import, paste and MCP write paths. *Today:* done for all of those. `src/lib/request-body.ts:39` streams with a cap; `src/app/api/submissions/route.ts:22` rate-limits and caps per page; `src/lib/block-tree.ts:42-47` bounds depth, node count, bytes and `sortOrder`; `src/lib/css-safety.ts:125` scans CSS iteratively. (NVX-016, NVX-017, NVX-018, NVX-013, NVX-014, NVX-015, NVX-019)
- ☐ **Blocker** — *Every* route that reads a body uses the cap, and saved blocks and revision restore go through the same block-tree schema as the rest. *Today:* three routes still hand `req.json()` an unbounded body — `src/app/api/saved-blocks/route.ts:20`, `src/app/api/pages/[id]/revisions/route.ts:20` and `src/app/api/sites/[id]/legal/route.ts:72,88` — and saved blocks validate with a local `isBlock()` (`src/app/api/saved-blocks/route.ts:23`) rather than `normalizeBlockTree`. *Do:* route those four call sites through `readJsonBody()` and `normalizeBlockTree()`, which both already exist.
- ☑ **Blocker** — The unused image optimizer is switched off. *Today:* done. `next.config.js:24` sets `unoptimized: true` and `remotePatterns` is gone, so `/_next/image` fetches nothing on request. (NVX-012)
- ☑ **Blocker** — The editor sanitises stored HTML before it touches the DOM, and sanitised content cannot name an element `__next_f`. *Today:* done. `src/components/blocks/Editable.tsx:71,84,94` sanitises on write, on read-back and at render; `src/lib/sanitize.ts:40,83-87` prefixes every `id`; the server-side walker at `src/lib/block-tree.ts:102` covers content that never passes through the editor. (NVX-024, NVX-045)

### Should

- ☑ **Should** — `style` attributes are filtered through the existing CSS declaration checker. *Today:* done. `src/lib/sanitize.ts:77` routes them through `sanitizeStyleAttribute`, and `src/lib/css-safety.ts:227` blocks `position`, `z-index` and `pointer-events` so an overlay cannot be built. (NVX-006)
- ☑ **Should** — Colour, length and background props are validated before they become inline styles, on write and at render. *Today:* done. `colorProp`/`lengthProp` (`src/lib/block-tree.ts:97-99`, via `src/lib/css-value.ts`) on write, `safeProps` at render. (NVX-007)
- ☑ **Should** — The site accent is validated on every write path and guarded at its three inline sinks. *Today:* done. `safeAccent` (`src/lib/site-fields.ts:39`) guards the dashboard gradient (`src/app/(builder)/page.tsx:66`), the admin swatch (`src/app/(builder)/admin/sites/[id]/page.tsx:37`) and the public logo square (`src/components/public/SiteChrome.tsx:183`). (NVX-008)
- ☑ **Should** — The exported stylesheet is filtered after Tailwind runs. *Today:* done. `filterCompiledCss()` (`src/lib/export-css.ts:88`) runs on the compiled output, so an arbitrary-value class cannot smuggle a live rule into the customer's site. (NVX-009)
- ☑ **Should** — The iframe allowlist matches exact hostnames from one shared module that the CSP also uses. *Today:* done. `src/lib/embed-hosts.ts:22` holds exact hosts; the CSP derives from it (`src/proxy.ts:140`) and so does the sanitiser (`src/lib/sanitize.ts:159`). (NVX-023)
- ☑ **Should** — The SVG sanitiser resolves attribute local names before checking URLs. *Today:* done. `splitAttribute()` (`src/lib/security.ts:173`) resolves the prefix, applied at `:245-249`. (NVX-025)
- ☑ **Should** — Site import runs the same field validators as the settings API. *Today:* done. `src/lib/site-archive.ts:149` calls `normalizeSiteFields()`. (NVX-027)
- ☑ **Should** — Custom header and footer placeholders escape the values they substitute. *Today:* done. `src/components/public/SiteChrome.tsx:76-80` escapes, and `:94` replaces via a function so `$&`-style patterns are inert. (NVX-062)
- ☑ **Should** — The CSP splits element and attribute styles, nonces the app's own `<style>` tags and reports violations somewhere. *Today:* done. `src/proxy.ts:132-148` splits `style-src-elem`/`style-src-attr`, carries a nonce and sets `report-uri`; `src/app/api/csp-report/route.ts` receives them. (NVX-033)
- ☐ **Should** — `sanitize-html` is at 2.17.7 or later and two tests pin the advisory payloads. *Today:* Partly: the dependency is at 2.17.7 (`package.json:41`). The two regression tests do not exist — `src/lib/sanitize.test.ts` has no case for either advisory payload, so a future downgrade would be silent. (NVX-035)
- ☑ **Should** — The `X-Forwarded-Host` header is only trusted when the operator says there is a proxy, and the nginx example sets it explicitly. *Today:* done. `trustsProxy()` (`src/proxy.ts:82`) gates it behind `NEURAVEX_TRUST_PROXY`, `servingHost()` (`:177`) applies it, and the recipe sets the header (`INSTALL.md:283`). (NVX-034, NVX-036)
- ☑ **Should** — The public page selects only the columns it renders and passes small objects to client components. *Today:* done. The column select at `src/app/(published)/sites/[siteSlug]/[[...pageSlug]]/page.tsx:81` excludes the legal profile, and `:119-125` passes narrowed objects to the client. (NVX-S001)
- ☑ **Should** — `prisma`, `tsx`, `tailwindcss` and `autoprefixer` are runtime dependencies and nothing reaches them through `npx`. *Today:* done. All four are in `dependencies` (`package.json:33-44`), and `resolveBin()` (`scripts/local-bin.js:110`) runs every tool from the local tree, so no documented command can fetch one from the registry. (NVX-022)
- ☑ **Should** — Uploads are checked against their magic bytes, stripped of EXIF metadata, and served through a route that refuses symlinks. *Today:* done. Magic bytes `src/lib/uploads.ts:156`, EXIF stripping `:220` (both used by `src/app/api/upload/route.ts:106,116`), and the serving route refuses symlinks via `lstatSync` (`src/lib/uploads.ts:89`). (NVX-061, NVX-059, NVX-054)
- ☑ **Should** — The exported form cannot submit anywhere, and the legal audit scans every string prop and counts links as links. *Today:* done. `disableExportedForms()` (`src/lib/static-export.ts:194`); the audit walks rich-text props (`src/lib/legal/audit.ts:224`) and reports a link as `outbound-link` rather than as third-party content (`:311`). (NVX-020, NVX-021, NVX-056, NVX-057)
- ☑ **Should** — MCP tool results mark stored site text as data, and destructive tools need an explicit confirmation. *Today:* done. `siteData()` (`mcp-server.ts:153`) wraps every result with a data marker; `:316` and `:541` require `confirm: true`. (NVX-S003)
- ☑ **Should** — Site import normalises page slugs, `isHome` and `legalKind` the way every other writer does. *Today:* done. `pageCreateData()` (`src/lib/site-archive.ts:186`) slugifies, and `normalizeArchivePages()` (`:219`) settles `isHome`, `legalKind` and slug collisions. (NVX-S002)
- ☑ **Should** — A `SECURITY.md` names a private reporting channel, the scope (builder, MCP server, exported site), the "no sign-in by design" statement and which versions get fixes. *Today:* done — `SECURITY.md`. (NVX-039)
- ☑ **Should** — CI runs an audit with a dated exception list, and Dependabot or Renovate is configured. *Today:* done. Dependabot runs weekly; CI reports every advisory and fails the build on anything at **high or above** in a production dependency, through `scripts/audit-gate.js`. The exception list is stronger than "dated": an entry is named by advisory id, carries the finding and the mitigation it rests on, and a `holds()` that re-reads that mitigation on every run — so an exception lapses in the commit that breaks it. An entry whose advisory has gone fails too, so the list cannot rot. It is empty today. (NVX-065)
- ☑ **Should** — GitHub Actions are pinned to commit SHAs and the workflow declares `permissions: contents: read`. *Today:* done. `.github/workflows/ci.yml:11` declares the permission; every action is pinned by SHA (`:23, :27, :58, :62, :84, :100, :104`). (NVX-060)

### Nice

- ☑ **Nice** — `X-Powered-By` is suppressed, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` are set, DNS prefetch is off, and the proxy recipe adds HSTS. *Today:* done — `next.config.js:6,51,58,63` and `INSTALL.md:263`. (NVX-046, NVX-073, NVX-036)
- ☑ **Nice** — The database file and its WAL are created `0600` and the launcher sets a private umask, for shared hosts. *Today:* done — `restrictPermissions()` (`src/lib/prisma.ts:38`) covers the `-wal` and `-shm` sidecars too, and `electron/server.js:144` sets `umask(0o077)`. (NVX-050)
- ☑ **Nice** — The upload route answers 400, not 500, to a non-file part or a non-multipart body; a malformed percent-encoded asset reference no longer breaks the whole download. *Today:* done — `src/app/api/upload/route.ts:51-57` and `src/lib/static-export.ts:126-132`. (NVX-047, NVX-041)
- ☑ **Nice** — `data:` links are allowed on images only and every `target="_blank"` carries `rel`. *Today:* done — `src/lib/sanitize.ts:100-105`, and `rel="noopener noreferrer"` at `:146` and `:198`. (NVX-048, NVX-070)
- ☑ **Nice** — JSON API responses send `Cache-Control: no-store` so a caching proxy cannot store exports or submissions. *Today:* done — `next.config.js:67-73` on `/api/:path*`. (NVX-068)
- ☑ **Nice** — Builder pages carry `noindex` and the root serves a `robots.txt`, for the case where an instance is reachable. *Today:* done — `src/app/robots.ts` and `src/app/(builder)/layout.tsx:10`. (NVX-069)
- ☑ **Nice** — `sourceMappingURL` comments are stripped in `sanitizeCss()` as insurance against a future postcss downgrade. *Today:* done — `src/lib/security.ts:52`. (NVX-064)

---

## 2. First run, packaging and releases

- ☑ **Blocker** — A picture uploaded during a session is served immediately in production mode. *Today:* done. Uploads live outside `public/` (`src/lib/uploads.ts:29`) and are served by a route handler (`src/app/uploads/[name]/route.ts:36`), so Next's one-time snapshot of `public/` no longer decides what a visitor can fetch; `e2e/production-only.spec.ts:19` covers it against `next start`. (NVX-005)
- ☑ **Blocker** — `npm run desktop` rebuilds when the source has changed. *Today:* done. `scripts/build-state.js` fingerprints the source as a walk of paths, sizes and timestamps — 18 ms, against the seconds a content hash of 53 MB of photographs would cost — and records it in `prisma/.neuravex-state.json` beside the schema fingerprint. `npm run build` records it too, so a hand build and a launcher build are the same event and the documented `npm run build && npm run desktop` does not build twice. An install that predates the fingerprint is judged on whether `.next/BUILD_ID` is newer than every source file, so updating does not force a needless rebuild.
- ☐ **Blocker** — There is a tagged release a customer can install without cloning a moving branch. *Today:* Partly: the licence owner is filled (`LICENSE:189`) and `CHANGELOG.md` exists. Still missing: `git tag` is empty, there is no release workflow, `INSTALL.md:72` says `git clone https://github.com/YOUR_USERNAME/neuravex.git`, and `start-desktop.sh:5` exports a path specific to one machine. *Do:* fix the clone URL, tag `v0.1.0`, add a release workflow on `v*` tags that runs CI plus e2e and attaches an archive.
- ☑ **Blocker** — The Docker example builds and starts a working, non-root instance bound to loopback on the host. *Today:* done. A tested multi-stage `Dockerfile` (non-root at `:79`, schema applied on boot at `:93`), a `.dockerignore`, and `INSTALL.md:356`. (NVX-011)
- ☑ **Should** — The Node.js policy is one statement everywhere: `engines`, `.nvmrc`, README, INSTALL, CI. *Today:* done, at 22.12 — `package.json:6-8`, `.nvmrc`, `README.md:44`, `INSTALL.md:27-41`, and CI reads `.nvmrc` through `node-version-file` (`ci.yml:29`) so it cannot drift. (NVX-028)
- ☐ **Should** — The version string has one source. *Today:* Partly: both launchers read it from `package.json` (`electron/server.js:18`, `mcp-server.ts:179`), so the three-way duplication is gone. It is still not shown in the admin footer, so a customer cannot say what they are running.
- ☐ **Should** — `package.json` is release-ready. *Today:* Partly: `license` (`:5`) and `engines` (`:6-8`) are set. `name` is still `website-builder` and there is no `repository` field. *Do:* `neuravex`, plus the GitHub URL.
- ☐ **Should** — `CHANGELOG.md` exists with a `0.1.0` entry and the two security commits (`42e842f`, `6e2b7e9`) named. *Today:* Partly: `CHANGELOG.md` exists with `[Unreleased]` and `[0.1.0]` sections. Neither security commit is named in it.
- ☐ **Should** — A `RELEASING.md` or `npm run check` script lists what a maintainer runs before tagging (lint, tsc, unit, build, e2e, audit, version bump, changelog, tag, smoke test of the unpacked archive on a clean machine). *Today:* nothing; `test:all` is the closest.
- ☐ **Should** — The launcher fails clearly when the port is busy or a second copy starts. *Today:* `electron/server.js:73` still treats any answer below 500 as success and `main()` has no `exit` listener for the child; with something else on the port it prints "Ready!", opens a tab on the other server and exits 0. *Do:* listen for the child's exit, say "Port 3939 is in use, run `npm run desktop 4000`".
- ☑ **Should** — Stopping the launcher stops the server. *Today:* done. `spawnBin()` (`scripts/local-bin.js:166`) spawns without a shell and detached, and `stopServer()` (`electron/server.js:96`) signals the whole group via `signalGroup()` (`:125`), with `taskkill /T` on Windows. (NVX-031)
- ☐ **Should** — The seed and the MCP server find the database regardless of when `prisma generate` last ran. *Today:* Partly: `.env` is loaded for every child process (`scripts/local-bin.js:78`) and by the MCP server itself (`mcp-server.ts:60`), which fixes `npm run db:seed` straight after `npm install`. Still open: `setup-mcp.sh` writes no `env` block, so an MCP client it configures can still fail with "Environment variable not found: DATABASE_URL", and that message is not in Troubleshooting.
- ☐ **Should** — A test actually runs the first-run path. *Today:* Partly: `src/lib/first-run.test.ts` now invokes `lossIsIntentional` (`:41`), but the rest (`:11-38`) still asserts on the script's source text and never calls `firstRun()`. *Do:* an integration test that copies the scripts into a temp dir, runs `node scripts/first-run.js` with no `DATABASE_URL`, and asserts the demo site exists.
- ☑ **Nice** — `tsconfig.tsbuildinfo` is not committed. *Today:* done — untracked. (NVX-072)
- ☑ **Nice** — `NEXT_TELEMETRY_DISABLED=1` and `CHECKPOINT_DISABLE=1` are set by the `dev`, `build` and `start` scripts, the launcher and CI, so the "runs entirely on your machine" promise holds for every documented command. *Today:* done. `OFFLINE_ENV` (`scripts/local-bin.js:60`) is applied by `childEnv()` to every script, the launcher and CI, so there is no path that has to remember. (NVX-055)
- ☐ **?** — The Windows launcher path (`start-desktop.bat`, `shell: true`, Ctrl-C, closing the window) has been tried on Windows 10 or 11. *Today:* no Windows host was available; `INSTALL.md:62-65` says "Fully supported".

---

## 3. Build, CI and tests

- ☑ **Blocker** — The unit baseline is green and reproducible: 32 files, 574 tests, `tsc` clean, lint clean (0 errors, 8 documented warnings), a fresh `next build` with no warnings, lockfile v3 with `npm ci`.
- ☑ **Should** — The Playwright suite (24 specs, 169 tests, the only coverage of the UI, every API route and the proxy) runs in CI, against `next start`, with the demo site seeded. *Today:* done — `.github/workflows/ci.yml:55-89`, with `playwright install` as an explicit step so nothing is undocumented. (NVX-029)
- ☑ **Should** — A unit test covers the Origin check and the production CSP directly. *Today:* done — `src/proxy.test.ts` covers the Host allowlist (`:62-88`), six Origin cases (`:90-129`) and the production CSP (`:191-222`).
- ☑ **Should** — Running `npm run test:e2e` cannot touch a customer's own sites. *Today:* done. `scripts/e2e.js` builds a throwaway database and upload directory under `data/e2e/`, seeds them and removes them afterwards; `playwright.config.ts` never adopts a server it did not start, so the launcher's own port can no longer be mistaken for the suite's; and `e2e/global-setup.ts` refuses to run a single test until it has read a row it wrote back out through the server under test.
- ☐ **Should** — CI covers the platforms the docs claim: an OS matrix for install, build and unit tests, and a smoke job that starts `node electron/server.js` headless and curls `/`. *Today:* `ubuntu-latest` only, in all three jobs.
- ☐ **Should** — The headline features each have an end-to-end test. *Today:* Partly: `e2e/trash.spec.ts` covers restore and unpublish. Still missing: drag from the palette and reorder, revision restore through the panel, page duplicate/move/make-home, redo, and the MCP tools over stdio.
- ☐ **Should** — A browser-support statement exists and matches what is tested. *Today:* Desktop Chrome only in Playwright (`playwright.config.ts:24`); the editor relies on `contentEditable`, `execCommand` and `beforeunload`, which differ in Firefox and Safari; no statement anywhere.
- ☐ **Nice** — Component and route-handler tests are possible: widen `vitest` include to `.tsx`, use jsdom for components, call route handlers with an in-memory database. *Today:* `vitest.config.mts:10` includes `src/**/*.test.ts` and `scripts/**` only — no `.tsx`, no jsdom.
- ☐ **Nice** — ESLint goes beyond `next/core-web-vitals` (type-aware rules, `no-floating-promises`, `eslint-plugin-no-unsanitized` for the `dangerouslySetInnerHTML` sites). *Today:* Partly: the move off `next lint` is done — Next 16 removed it, so linting is `eslint .` against a flat config on ESLint 9 (`eslint.config.mjs`). The rule set is still `next/core-web-vitals` plus two documented relaxations, and nothing more.
- ☐ **Nice** — TypeScript enables `noUncheckedIndexedAccess` and `checkJs` for the two launcher scripts a customer runs first. *Today:* `tsconfig.json` has neither.
- ☐ **Nice** — Workflow hygiene: `concurrency`, `timeout-minutes`, artefact upload on failure. *Today:* Partly: the Playwright report uploads on failure (`ci.yml:84`). No `concurrency` and no `timeout-minutes` on any job.

---

## 4. Data: backup, restore, growth and integrity

- ☑ **Blocker** — Backup instructions name everything a customer would lose and are safe while the app runs. *Today:* done. `npm run backup` (`scripts/backup.js`, `package.json:22`) does it safely, and `INSTALL.md:329-346` names the uploads directory and the WAL sidecars explicitly rather than saying "copy `dev.db`". (NVX-037)
- ☑ **Blocker** — The web app really runs SQLite in WAL mode. *Today:* done. The PRAGMAs at `src/lib/prisma.ts:24-31` are awaited — they were lazy promises nothing waited on — and `$extends` (`:67-79`) gates every query on them having landed, so a web-only install gets WAL rather than inheriting it from whatever the MCP server did last. (NVX-030)
- ☐ **Should** — A written, tried restore procedure exists (quit, replace `dev.db`, delete stale `-wal`/`-shm`, restore uploads, `npm run setup`, start). *Today:* Partly: `INSTALL.md:344-346` covers quit, replace and uploads. It does not mention deleting the stale `-wal`/`-shm` files or running `npm run setup`, which are the two steps that decide whether the restore actually takes.
- ☐ **Should** — The JSON export is described honestly and can be imported from the UI. *Today:* `POST /api/sites/import` exists but there is no Import button anywhere in `src/components/admin/`, and no sentence saying uploads travel separately. *Do:* an "Import site" action beside "New site"; longer term a zip export that includes the files.
- ☐ **Should** — Concurrent writers get a retry or a readable message. *Today:* no route catches Prisma errors, there is no retry on "database is locked", and no save sends `updatedAt` for a 409 — so a stale tab or the MCP agent silently overwrites the other.
- ☑ **Should** — The save endpoint refuses a `content` that is not a block array, and every writer rejects malformed trees. *Today:* done — `normalizeBlockTree` refuses a non-array (`src/lib/block-tree.ts:320`) and the save route applies it (`src/app/api/pages/[id]/save/route.ts:78`). (NVX-014)
- ☐ **Should** — Visitor submissions can be listed in full, exported and deleted, and a retention period can be set. *Today:* Partly: paging with a total and CSV export exist (`src/app/api/pages/[id]/submissions/route.ts:25-52`, UI at `src/components/admin/SubmissionsViewer.tsx:127`) and deletion exists (`src/app/api/submissions/route.ts:77`). The retention period is still only prose in the generated notice (`src/lib/legal/profile.ts:224`) — nothing enforces or even stores it. (NVX-058)
- ☐ **Should** — Unbounded growth has a story. *Today:* Partly: submissions now have a rate limit and a 5 000 cap, page content has a byte cap, the media picker is SQL-prefiltered (`src/app/api/media/route.ts:26`) and export CSS is cached (`src/lib/export-css.ts:26`). Still open: uploads are stored at original size, there is no unused-files view, and the trash keeps 50 whole sites with their history.
- ☐ **Should** — "Delete forever" in the trash asks first. *Today:* `src/components/admin/TrashPanel.tsx:54` deletes on one click; the entry is the last copy of a site with its revisions and submissions.
- ☐ **Should** — Data can live outside the checkout, and the docs say the install folder *is* the data directory. *Today:* Partly: `DATABASE_URL` can be absolute and `NEURAVEX_UPLOAD_DIR` moves the uploads (`src/lib/uploads.ts:30`, documented at `INSTALL.md:129`). The state file is still hard-coded under `prisma/` (`scripts/first-run.js:28`), and nothing warns that "delete the folder" is "delete my sites".
- ☐ **Nice** — Restoring a revision cancels the pending autosave and snapshots the pre-restore content, so a restore is itself reversible. *Today:* `src/app/api/pages/[id]/revisions/route.ts:30` overwrites without snapshotting, and `src/components/editor/RevisionsPanel.tsx:35` does not cancel the pending autosave.
- ☐ **Nice** — The schema-evolution policy is written down: `db push` on start, `intentional-drops.json`, what to do when the launcher refuses a lossy change, and how to downgrade (restore the matching backup); `prisma migrate` before 1.0. *Today:* `prisma/intentional-drops.json` exists and is undocumented.
- ☑ **Should** — `npm run db:reset` builds the new database beside the live one and only renames on success; `git pull` cannot touch data (all data paths are gitignored). Verified.

---

## 5. Operations

- ☑ **Blocker** — The reverse-proxy recipe leaves the builder reachable only through the proxy, with auth on the admin surface and public access to published sites and the visitor form. *Today:* done — `INSTALL.md:228-327` carries the 421 explainer, `auth_basic` at server level with exemptions for `/sites/`, `/uploads/` and `= /api/submissions`, HSTS (`:263`), the port-80 redirect (`:247`), an explicit `X-Forwarded-Host` (`:283`), `proxy_read_timeout 120s` for the download route (`:285`) and a "never do this" warning (`:325`). (NVX-036)
- ☑ **Should** — The download, sitemap and robots routes work behind an HTTPS proxy. *Today:* done — `src/lib/self-origin.ts:32,49` is used by the download route (`:62`), the sitemap (`:32`) and robots (`:20`), so none of them self-fetches an address the proxy does not serve. (NVX-026)
- ☐ **Should** — A cheap `GET /api/health` returns version, database reachability, upload directory writability and journal mode, and the launcher, Docker and the proxy use it. *Today:* no health route exists; the launcher polls `/` (`electron/server.js:179`) and `Dockerfile:85` healthchecks `/api/sites`.
- ☐ **Should** — Logs survive a closed window and swallowed errors say something. *Today:* Partly: the launcher's own output is on the console. There is still no log file, and `src/app/api/upload/route.ts:18` still swallows a failed `mediaFile.create`.
- ☐ **Should** — Supervision guidance exists (a systemd unit with `Restart=on-failure`, `--restart unless-stopped` for Docker) and the launcher does not silently exit when its child dies. *Today:* neither.
- ☑ **Should** — The production checklist says the instance is single-tenant: everyone behind the proxy credential is an administrator of every site, nothing is logged, and the trash keeps the newest 50 items. *Today:* done — `INSTALL.md:348-355` and the Production Checklist at `:200`. (NVX-052)
- ☐ **Should** — Reverse-proxy operators are told about the amber "not on this machine" banner, or an env flag swaps it for "access is controlled by your proxy". *Today:* `src/components/admin/NetworkNotice.tsx:20` still decides on the hostname alone, so every proxied operator sees a permanent warning telling them to run on localhost.
- ☐ **Should** — Uninstall is documented, including the MCP config `setup-mcp.sh` writes elsewhere on the machine, and `setup-mcp.sh` backs up and merges instead of overwriting. *Today:* Partly: the script backs up before writing (`setup-mcp.sh:65-69`). It still overwrites rather than merges, and there is no uninstall section in `INSTALL.md`. (NVX-053)
- ☐ **Nice** — Graceful shutdown: wait for the child, checkpoint the WAL, and say that `dev.db-wal`/`-shm` belong to the database. *Today:* Partly: the launcher waits for the child's exit (`electron/server.js:96`) and the docs name the sidecars (`INSTALL.md:337`). Nothing checkpoints the WAL on shutdown.
- ☐ **Nice** — A troubleshooting entry for a moved install directory ("Query engine library for current platform could not be found → `npm install`") and for a stale absolute `DATABASE_URL` in an MCP client config (which silently creates an empty database). *Today:* neither entry exists.

---

## 6. Documentation and support

- ☐ **Should** — One port story. *Today:* Partly: the MCP server's `get_site_url` now hands agents 3939 (`mcp-server.ts:574`) and `setup-mcp.sh:144` agrees. `README.md:63,65` and INSTALL's dev-server sections still say 3000. (NVX-038)
- ☑ **Should** — The MCP tools table matches the server. *Today:* done — `INSTALL.md:492-517` lists all sixteen, and `src/lib/mcp-server.test.ts` fails if the table and the registrations drift apart. (NVX-038)
- ☐ **Should** — README's project layout and data model describe the tree that exists. *Today:* Partly: the "DOMPurify" error is gone (`README.md:104` names `sanitize-html`). The layout still uses pre-route-group paths (`:89-113`), the data model lists two of seven models (`:116-118`), and there is no mention of `src/proxy.ts`, `mcp-server.ts`, `scripts/`, `electron/`, `e2e/` or `src/lib/legal/`.
- ☐ **Should** — `setup-mcp.sh` does what `INSTALL.md` says. *Today:* Partly: Claude Desktop config is written (`setup-mcp.sh:115`). It still writes no `env` block, and still echoes about `opencode.json` (`:75-80`) which INSTALL never mentions.
- ☐ **Should** — In-app copy does not recommend something the app strips. *Today:* `src/components/admin/SiteSettings.tsx:198` no longer says `@import` — but it now tells users to load Google Fonts "via a Google Fonts link in Advanced → Custom CSS", and Custom CSS cannot hold a `<link>` either. The advice is still impossible to follow.
- ☐ **Should** — `INSTALL.md` Troubleshooting covers the messages a first-week user will see. *Today:* Partly: port-in-use, schema errors and reset are covered. Missing: "Environment variable not found: DATABASE_URL", "database is locked", changing the desktop port, the Windows batch-file flow and the network banner. Worse, `INSTALL.md:596-606` ("Uploads Not Working") is now **wrong** — it tells the reader to `mkdir -p public/uploads`, but uploads moved to `data/uploads`.
- ☐ **Should** — A user guide beyond README: block reference, template list (generated from `TEMPLATES`), keyboard shortcuts (the editor implements Cmd+Z, Shift+Cmd+Z, Cmd+C/X/V/D, Delete, Escape, Ctrl+B/I; README documents Cmd+S), the legal-pages flow. *Today:* none.
- ☐ **Should** — `CONTRIBUTING.md` (setup, `npm test`, `npm run test:e2e`, lint, PR conventions) and a "Getting help" section with a real channel. *Today:* neither; no help link in the app.
- ☐ **Should** — Screenshots or a short GIF in README. *Today:* no images anywhere in the repo.
- ☐ **Should** — Known limitations state the scope decisions plainly. *Today:* Partly: `README.md:207` has a limitations list. It omits one user / no accounts, German-only legal pages, that forms in a downloaded site cannot submit anywhere, and that the builder targets desktop browsers.
- ☐ **Nice** — `docs/PRODUCT_REVIEW.md` moves under `docs/internal/` or gets a banner saying every P0 and P1 in it is resolved; `docs/README.md` indexes the user guide. *Today:* neither.
- ☐ **Nice** — Issue and PR templates (OS, Node version, how the app was started, port, the `[neuravex]` log lines) and a `CODE_OF_CONDUCT.md`. *Today:* `.github/` holds only `dependabot.yml` and `workflows/ci.yml`.
- ☐ **Nice** — A FAQ: where are my sites, why no login, how do I put the site online, forms on a static host, custom domains. *Today:* none.
- ☑ **Nice** — Feature counts in README are right: 13 block types, 28 templates (11 multi-page), 74 bundled photographs. Verified.
- ☑ **Nice** — README's "Using the editor" and URL scheme match the UI; `.env.example` is accurate. Verified.

---

## 7. Legal, licensing and privacy

- ☐ **Blocker** — The German legal texts have been reviewed by a qualified person, and the review date and scope are recorded. *Today:* `src/lib/legal/*` was written in one commit with no reviewer; the feature produces documents the customer publishes under their own liability, through the UI and through the MCP tool. *Do:* a review by a German lawyer or data-protection professional; until then label the feature "Beta" in the UI and README. **This one cannot be closed by writing code.**
- ☑ **Blocker** — The generated Datenschutzerklärung only asserts what the operator confirmed. *Today:* done. `hostingDpa` is tri-state and says nothing when unset (`src/lib/legal/profile.ts:218`, gated at `src/lib/legal/datenschutz.ts:145`); the form text now matches what the builder actually stores (`:170-192`); `formFate` has no default (`profile.ts:222`), so nothing is assumed on the operator's behalf. (NVX-040)
- ☐ **Should** — The notice covers every way a Neuravex site can be served. *Today:* Partly: `formFate: "builder"` (`src/lib/legal/profile.ts:121`) covers a form served by the builder. There is still no "we serve the whole site ourselves" hosting mode, so the reverse-proxy case gets wrong hosting text.
- ☐ **Should** — The licence is declared consistently and the owner is named. *Today:* Partly: `LICENSE:189` names Alpha Flows and `package.json:5` declares Apache-2.0. README still has no licence section.
- ☑ **Should** — The runtime dependency inventory is right. *Today:* done — `tailwindcss` (`package.json:43`) and `autoprefixer` (`:33`) are runtime dependencies, so `npm ci --omit=dev` no longer breaks downloads.
- ☐ **Should** — Someone has read the Unsplash Licence's "no competing service" clause against shipping 74 Unsplash photographs as a searchable, categorised picker, and recorded the conclusion in `public/stock/README.md`. *Today:* attribution and provenance are complete; the clause is unexamined.
- ☐ **Should** — Embeds use privacy-preserving variants where they exist (`youtube-nocookie.com`, Vimeo `dnt=1`), or README says embeds contact third parties and a consent facade is the operator's job. *Today:* Partly: `youtube-nocookie.com` is in the allowlist (`src/lib/embed-hosts.ts:24`). Nothing rewrites a pasted URL to it, and README says nothing.
- ☑ **Should** — Operators can answer a DSGVO subject request for form data: full listing, CSV export and deletion all exist (see §4).
- ☐ **Should** — README states the legal feature is German-law only, is not legal advice, and produces German text. *Today:* `README.md:28` describes the feature without any of the three.
- ☐ **Nice** — Generated legal pages carry a "Stand: <Monat Jahr>" line. *Today:* no "Stand:" line anywhere in `src/lib/legal/*.ts`.
- ☐ **Nice** — A `THIRD-PARTY-LICENSES` file and a photo credits list ship with any packaged distribution; the product name is consistent. *Today:* neither; `package.json:2` is still `website-builder`.
- ☐ **Nice** — The one live-TLD placeholder in the templates (`hello@the.studio`, `src/lib/templates.ts:549`) becomes a reserved address.
- ☑ **Should** — The production dependency tree is permissive only (MIT, Apache-2.0, ISC, BSD, one CC-BY-4.0 data package; no copyleft). Verified with `license-checker`.
- ☑ **Should** — The 74 bundled photographs have a complete manifest with credit, URL and licence, no missing or unlisted files, no EXIF or GPS data. Verified.
- ☑ **Should** — Nothing in the builder or the published pages loads external fonts, images or scripts; templates reference `/stock/` only; visitor submissions store no IP, user agent or referrer; nothing about the operator is stored or sent. Verified.
- ☑ **Blocker** — The legal flow and the MCP tool both say the pages are not legal advice and must be read before publishing, and generation refuses while a § 5 DDG field is missing. Verified.

---

## 8. Product quality

- ☑ **Should** — Published sites and the builder have their own 404 and error pages. *Today:* done. A `not-found.tsx` and an `error.tsx` beside each of the two root layouts — one file per layout, because both live inside route groups and a single file at `src/app/` would render above both `<html>` elements — plus `src/app/global-error.tsx`, which is what catches a throw in a root layout itself, such as the published layout's own database read. None of them prints the error's message; the digest is offered instead. The boundaries are covered by `e2e/error-pages.spec.ts`, which runs a second server against a table-less database, since every render path in the app is otherwise guarded well enough that nothing can be made to throw.
- ☐ **Should** — Keyboard-only users can reorder blocks and reach every control. *Today:* pointer sensor only, no move up/down buttons, modals do not trap or return focus.
- ☑ **Should** — A CSV download of a page's submissions exists, since the viewer stops at 100. *Today:* done — `src/app/api/pages/[id]/submissions/route.ts:29` and the Export CSV link at `src/components/admin/SubmissionsViewer.tsx:127`.
- ☐ **Nice** — Large-site performance. *Today:* Partly: the media picker no longer rescans every page (`src/app/api/media/route.ts:26`, NVX-042) and export CSS is cached (`src/lib/export-css.ts:26`, NVX-043). Still open: the pages list loads full `content` just to show titles, and the revisions panel refetches up to 50 full snapshots after every autosave.
- ☐ **Nice** — Non-Latin site names get a usable slug instead of `untitled`; uploads prompt for a description; images are resized on upload; the download carries a canonical URL and sitemap once a base URL setting exists, and `og:image` stops pointing at `localhost`. *Today:* Partly: `og:image` and the canonical URL are fixed (`src/lib/static-export.ts:96,111`, NVX-051). A non-Latin name still slugs to `untitled` (`src/lib/utils.ts:44`), and there is no description prompt or resize.
- ☐ **Nice** — The delete-site button moves to a "Danger zone" away from the Save row. *Today:* still in the settings body (`src/components/admin/SiteSettings.tsx:290`).
- ☑ **Blocker** — Site and page deletion confirm with counts and go to a trash with restore; the unsaved-changes guard, save-failure state and autosave/manual-save semantics are in place and covered by e2e tests. Verified.

---

## 9. What to say at launch

These are decisions already made in `docs/PRODUCT_REVIEW.md` and the code. They belong in the
release notes and the README's limitations, in these words or plainer ones:

- Neuravex is downloaded software for a desktop browser. It is not hosted and there is no plan to
  host it or the sites it builds.
- There is no sign-in. It is meant to run on your own machine; if you expose it, you provide the
  access control, and this release binds to `localhost` by default.
- Getting a site online means *Download files* and hosting the folder yourself. Forms in the
  downloaded site have nowhere to send answers unless you point them at a form service.
- Responsive behaviour on published sites is column stacking and a collapsing nav.
- The Impressum and Datenschutzerklärung generator targets German law, writes German text, and is
  not legal advice.
- The MCP server lets an AI agent create, edit and publish sites. Anything the agent reads can
  instruct it; do not leave a page open in the editor while an agent edits it.
