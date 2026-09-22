# Neuravex — Launch Checklist

What has to be true before Neuravex is announced as something people download and run.
Written against `main` at `8e56c06` (20 September 2026), alongside the
[security review](./SECURITY_REVIEW.md); where a line here rests on a finding there, the
finding's id (`NVX-…`) is given so the two documents stay in step.

## How to read this

- Every line is something a person can tick. Each carries its **state today** and the
  evidence for that state, so the list is a record of where the project is, not a wish list.
- **Blocker** means shipping without it would harm or embarrass a customer on day one.
  **Should** means a first release ought to have it. **Nice** is worth doing when there is
  time.
- States: ☐ open (missing or only partly there) · ☑ done, verified in this repository · ? not determined.

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
| 1 | Uploads made while the app runs answer 404 until restart (NVX-005) | ☐ | The media library, the canvas and the published page all break for every picture added during a session. Nobody has seen it because the tests run the dev server. |
| 2 | `npm run desktop` and `npm run start` listen on every network interface (NVX-003) | ☐ | The product's whole security model is "only your own browser can reach it". On any shared network that is false, and there is no sign-in. One flag fixes it. |
| 3 | Next.js is two patches behind a public denial-of-service fix, and the 14.x line has ended (NVX-010, NVX-004) | ☑ | Done. The patch bump landed first; the 16.x migration followed, with React 19, the async request APIs, `middleware` renamed to `proxy` and `next lint` replaced by the ESLint CLI. `npm audit --omit=dev` reports nothing at all against what ships — it was 13 advisories, 1 of them critical. |
| 4 | A link written by an import, a paste or the MCP server runs as script on the customer's exported site (NVX-001), and the same content can lock the owner out of the editor (NVX-045) | ☐ | The exported site has no CSP. The button is the element visitors click most. An `id="__next_f"` in a footer stops React hydrating on the editor page for that site. |
| 5 | Anyone who can reach the port can fill the memory or the disk: bodies are buffered before any size check, submissions have no rate or count limit, block trees have no depth limit (NVX-016 to NVX-019, NVX-013 to NVX-015) | ☐ | Combined with #2 this is reachable from any shared network today. One shared validator and one body-size helper close it. |
| 6 | `git pull && npm run desktop` does not rebuild, although `INSTALL.md` says it does | ☐ | Every update serves the old build against a migrated database. |
| 7 | The Docker example in `INSTALL.md` cannot build and would be insecure if it could (NVX-011) | ☐ | Fix it or remove it before someone pastes it onto a server. |
| 8 | The `Datenschutzerklärung` the app writes makes claims the operator never confirmed (NVX-040), misses trackers in rich text (NVX-021), and has not been reviewed by a qualified person; the exported contact form leaks its answers into the URL (NVX-020) | ☐ | The customer publishes it under their own liability. |
| 9 | There is no release: no tag, no changelog, no version anyone can name, a placeholder clone URL and an unfilled licence owner | ☐ | A customer cannot say what they installed, and a maintainer cannot say what they shipped. |

---

## 1. Security

The state column says what the repository does today; the security review holds the evidence.

### Blockers

- ☐ **Blocker** — The launcher and the `start` script bind to `127.0.0.1` unless the operator opts out. *Today:* `electron/server.js:90` and `package.json:9` pass no `-H`; verified listening on `0.0.0.0` and answering on a non-loopback address. *Do:* add `-H 127.0.0.1` in both, a `HOST` opt-out with a loud log line, `-p 127.0.0.1:3000:3000` in the Docker line. (NVX-003)
- ☐ **Blocker** — The server refuses requests for hostnames it does not serve, so DNS rebinding cannot turn an attacker's page into a same-origin client. *Today:* `src/middleware.ts:115` only compares `Origin` with whatever `Host` arrived; a forged pair passes and `GET` is never checked. *Do:* a Host allowlist (`localhost`, IP literals, `NEURAVEX_ALLOWED_HOSTS`) applied to every method, answered with 421. (NVX-002)
- ☑ **Blocker** — `next` is at 16.3.5, on React 19, and the migration was gated by the full test suite (570 unit, 169 browser). *Today:* done. The RSC deserialisation DoS and the Windows RCE are both closed at the source rather than mitigated; `images.unoptimized: true` stays because nothing here uses the optimizer, and `sharp` is still absent. (NVX-010, NVX-004)
- ☐ **Blocker** — Link and media URLs in block props are validated on every write path and at render, and exported pages carry a meta CSP. *Today:* `ButtonBlock.tsx:75` renders any `href`; nothing on save, PATCH, import, paste or MCP checks a scheme. *Do:* `isSafeHref()` and `sanitizeBlockTree()` shared by all write paths; `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; …">` in every exported page. (NVX-001)
- ☐ **Blocker** — Every route that reads a body checks `Content-Length` and reads with a hard cap before parsing, form submissions are rate- and count-limited, and block trees are schema-, depth- and size-validated on every write path. *Today:* a 200 MB body grows the process by close to a gigabyte before it is rejected (NVX-016, NVX-017); 500 submissions arrive in 2.6 s with no limit (NVX-018); a 400-deep tree, a mis-typed prop or an out-of-range `sortOrder` turns a site into durable 500s (NVX-013, NVX-014, NVX-015); 9000 nested `rgb(` in custom CSS does the same (NVX-019). *Do:* one body-size helper; one zod block-tree schema shared by save, PATCH, import, paste, MCP, saved blocks and revision restore; a per-client rate limit and per-page cap on submissions; an iterative CSS scanner.
- ☐ **Blocker** — The unused image optimizer is switched off. *Today:* `/_next/image` is live with a `*.googleapis.com` wildcard, outside the middleware, and fetches attacker-hosted objects on request (NVX-012). *Do:* `images: { unoptimized: true }`, delete `remotePatterns`.
- ☐ **Blocker** — The editor sanitises stored HTML before it touches the DOM, and sanitised content cannot name an element `__next_f`. *Today:* `Editable.tsx:51` writes raw block HTML into `contentEditable`; a `<meta refresh>` in a text prop navigated the builder tab away, `<style>` restyled the admin UI, beacons fired. *Do:* an inline-text sanitiser profile on the way in and out, plus the server-side tree walker; prefix every `id` in the sanitiser. (NVX-024, NVX-045)

### Should

- ☐ **Should** — `style` attributes are filtered through the existing CSS declaration checker. *Today:* `sanitize.ts:35` allows `style` on every element with no `allowedStyles`, so `url()` beacons and full-page overlays pass. (NVX-006)
- ☐ **Should** — Colour, length and background props are validated before they become inline styles, on write and at render. *Today:* a `;` in a heading colour injects declarations. (NVX-007)
- ☐ **Should** — The site accent is validated on every write path and guarded at its three inline sinks. *Today:* the dashboard gradient, the admin swatch and the public logo square render any string. (NVX-008)
- ☐ **Should** — The exported stylesheet is filtered after Tailwind runs. *Today:* `[mask-image:url(https://…)]` in a `class` becomes a live rule in the customer's site. (NVX-009)
- ☐ **Should** — The iframe allowlist matches exact hostnames from one shared module that the CSP also uses. *Today:* a prefix regex; `youtube.com.evil.example` passes. (NVX-023)
- ☐ **Should** — The SVG sanitiser resolves attribute local names before checking URLs. *Today:* `x:href="javascript:…"` with a custom XLink prefix is stored and executes in the export. (NVX-025)
- ☐ **Should** — Site import runs the same field validators as the settings API. *Today:* `siteCreateData()` copies every field verbatim. (NVX-027)
- ☐ **Should** — Custom header and footer placeholders escape the values they substitute. *Today:* titles are concatenated as markup and `$` replacement patterns are honoured. (NVX-062)
- ☐ **Should** — The CSP splits element and attribute styles, nonces the app's own `<style>` tags and reports violations somewhere. *Today:* `style-src 'unsafe-inline'`, no `report-uri`. (NVX-033)
- ☐ **Should** — `sanitize-html` is at 2.17.7 or later and two tests pin the advisory payloads. *Today:* 2.17.5; unreachable with the current allowlists. (NVX-035)
- ☐ **Should** — The `X-Forwarded-Host` header is only trusted when the operator says there is a proxy, and the nginx example sets it explicitly. *Today:* the middleware prefers it from any client; harmless for browser attackers because of CORS preflight, but the recipe does not overwrite it. (NVX-034, NVX-036)
- ☐ **Should** — The public page selects only the columns it renders and passes small objects to client components. *Today:* every published page's RSC payload carries the raw legal profile (a DPO's private address typed at any wizard step), the unsanitised `customCss`, `headerHtml` and `footerHtml` source, and every page's content, twice. (NVX-S001)
- ☐ **Should** — `prisma`, `tsx`, `tailwindcss` and `autoprefixer` are runtime dependencies and nothing reaches them through `npx`. *Today:* all four are dev dependencies; from a `cwd` outside the repository `npx tsx` fetched and ran a registry copy with only a warning, and `npx prisma` would fetch a two-majors-ahead release candidate and run `db push` against the only database. (NVX-022)
- ☐ **Should** — Uploads are checked against their magic bytes, stripped of EXIF metadata, and served through a route that refuses symlinks. *Today:* extension and size only; a phone photo ships its GPS coordinates into the export; a symlink placed in `public/uploads` is listed, zipped and served. (NVX-061, NVX-059, NVX-054)
- ☐ **Should** — The exported form cannot submit anywhere, and the legal audit scans every string prop and counts links as links. *Today:* the exported form GET-navigates the visitor's answers into the URL and the host's log; a tracker in a Text block is invisible to the audit; a footer link is reported as third-party content that transmits the visitor's IP. (NVX-020, NVX-021, NVX-056, NVX-057)
- ☐ **Should** — MCP tool results mark stored site text as data, and destructive tools need an explicit confirmation. *Today:* `get_page` and `list_sites` return imported text verbatim to an agent that also holds `delete_site`; the trash keeps 50 items. (NVX-S003)
- ☐ **Should** — Site import normalises page slugs, `isHome` and `legalKind` the way every other writer does. *Today:* a raw slug makes a page unreachable, a download 502, and two home pages export as `index.html` and `index-2.html`. (NVX-S002)
- ☐ **Should** — A `SECURITY.md` names a private reporting channel, the scope (builder, MCP server, exported site), the "no sign-in by design" statement and which versions get fixes. *Today:* none. (NVX-039)
- ☐ **Should** — CI runs `npm audit --omit=dev --audit-level=high` with a dated exception list, and Dependabot or Renovate is configured. *Today:* most of it. Dependabot is configured and running; CI reports every advisory and fails on a critical one in a production dependency through `scripts/audit-gate.js`, which carries the exception list — the two `next` 14 criticals, each named by advisory id next to the mitigation it rests on, re-checked on every run so it lapses the moment the mitigation does. The gap is the level: this gates at critical, not high. With `next` on 16 the production tree reports no advisories at all, so the allowlist is empty and the `high` line could now be drawn. (NVX-065)
- ☐ **Should** — GitHub Actions are pinned to commit SHAs and the workflow declares `permissions: contents: read`. *Today:* `@v4` tags, no permissions block. (NVX-060)

### Nice

- ☐ **Nice** — `X-Powered-By` is suppressed, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` are set, DNS prefetch is off, and the proxy recipe adds HSTS. (NVX-046, NVX-073, NVX-036)
- ☐ **Nice** — The database file and its WAL are created `0600` and the launcher sets a private umask, for shared hosts. (NVX-050)
- ☐ **Nice** — The upload route answers 400, not 500, to a non-file part or a non-multipart body; a malformed percent-encoded asset reference no longer breaks the whole download. (NVX-047, NVX-041)
- ☐ **Nice** — `data:` links are allowed on images only and every `target="_blank"` carries `rel`. (NVX-048, NVX-070)
- ☐ **Nice** — JSON API responses send `Cache-Control: no-store` so a caching proxy cannot store exports or submissions. (NVX-068)
- ☐ **Nice** — Builder pages carry `noindex` and the root serves a `robots.txt`, for the case where an instance is reachable. (NVX-069)
- ☐ **Nice** — `sourceMappingURL` comments are stripped in `sanitizeCss()` as insurance against a future postcss downgrade. (NVX-064)

---

## 2. First run, packaging and releases

- ☐ **Blocker** — A picture uploaded during a session is served immediately in production mode. *Today:* Next snapshots `public/` once at start; new uploads 404 until restart; the e2e suite runs `next dev` and never sees it. *Do:* serve `/uploads/*` from a route handler; add a test that runs against `next start`. (NVX-005)
- ☐ **Blocker** — `npm run desktop` rebuilds when the source has changed. *Today:* `electron/server.js:41-51` builds only when `.next` is absent, so after `git pull` the stale bundle runs against a migrated database; `INSTALL.md:334` promises otherwise. *Do:* record the git HEAD or a source fingerprint next to the schema fingerprint in `prisma/.neuravex-state.json` and rebuild when it moves; until then change the Updating section to `npm run build && npm run desktop`.
- ☐ **Blocker** — There is a tagged release a customer can install without cloning a moving branch. *Today:* `git tag` is empty, no GitHub release, `INSTALL.md:47` still says `git clone https://github.com/YOUR_USERNAME/neuravex.git`, `start-desktop.sh` exports a path specific to one machine. *Do:* fix the clone URL, tag `v0.1.0`, add a release workflow on `v*` tags that runs CI plus e2e and attaches an archive (ideally prebuilt: `.next`, production `node_modules`, `prisma`, `public`, `electron`, `scripts`).
- ☐ **Blocker** — The Docker example builds and starts a working, non-root instance bound to loopback on the host. *Today:* fails at `npm ci` (postinstall runs before the schema is copied), no `.dockerignore`, no `DATABASE_URL`, no schema push, root, dev dependencies, `-p 3000:3000`. *Do:* ship a tested `Dockerfile` and `.dockerignore` in the repo or drop the section. (NVX-011)
- ☐ **Should** — The Node.js policy is one statement everywhere: `engines`, `.nvmrc`, README, INSTALL, CI. *Today:* README and INSTALL say 18+, CI runs 20, the test tools refuse below 20, Node 18 is end-of-life. (NVX-028)
- ☐ **Should** — The version string has one source. *Today:* `0.1.0` is typed in `package.json:3`, `electron/server.js:74` and `mcp-server.ts:74`. *Do:* read it from `package.json` in both and show it in the admin footer.
- ☐ **Should** — `package.json` is release-ready. *Today:* `name` is `website-builder`, no `license`, no `repository`, no `engines`. *Do:* `neuravex`, `Apache-2.0`, the GitHub URL.
- ☐ **Should** — `CHANGELOG.md` exists with a `0.1.0` entry and the two security commits (`42e842f`, `6e2b7e9`) named. *Today:* the git log is the only record.
- ☐ **Should** — A `RELEASING.md` or `npm run check` script lists what a maintainer runs before tagging (lint, tsc, unit, build, e2e, audit, version bump, changelog, tag, smoke test of the unpacked archive on a clean machine). *Today:* nothing; `test:all` is the closest.
- ☐ **Should** — The launcher fails clearly when the port is busy or a second copy starts. *Today:* `waitForServer` treats any answer below 500 as success and there is no `exit` listener; with something else on the port it prints "Ready!", opens a tab on the other server and exits 0 with an `EADDRINUSE` trace in the middle. *Do:* listen for the child's exit, say "Port 3939 is in use, run `npm run desktop 4000`".
- ☐ **Should** — Stopping the launcher stops the server. *Today:* a signal to the launcher's PID alone leaves `next-server` bound; Ctrl-C in a terminal is fine on macOS and Linux. *Do:* spawn without a shell and kill the process group; `taskkill /T` on Windows. (NVX-031)
- ☐ **Should** — The seed and the MCP server find the database regardless of when `prisma generate` last ran. *Today:* `npm run desktop` is fine because `prisma db push` regenerates the client after `.env` is written; but `npm run db:seed` straight after `npm install`, and an MCP client launched from `setup-mcp.sh` (which writes no `env` block), fail with "Environment variable not found: DATABASE_URL". *Do:* pass `DATABASE_URL` from `.env` into the seed spawn in `scripts/first-run.js`, load `.env` in `prisma/seed.ts` and `mcp-server.ts`, and have `setup-mcp.sh` write the `env` block; add the message to Troubleshooting.
- ☐ **Should** — A test actually runs the first-run path. *Today:* `src/lib/first-run.test.ts` asserts on the script's source text and never calls `firstRun()`. *Do:* an integration test that copies the scripts into a temp dir, runs `node scripts/first-run.js` with no `DATABASE_URL`, and asserts the demo site exists.
- ☐ **Nice** — `tsconfig.tsbuildinfo` is not committed. *Today:* tracked, 186 KB, rewritten by every `tsc` run. (NVX-072)
- ☐ **Nice** — `NEXT_TELEMETRY_DISABLED=1` and `CHECKPOINT_DISABLE=1` are set by the `dev`, `build` and `start` scripts, the launcher and CI, so the "runs entirely on your machine" promise holds for every documented command. *Today:* the Prisma checkpoint ping is never disabled; the plain npm scripts leave Next telemetry on. (NVX-055)
- ☐ **?** — The Windows launcher path (`start-desktop.bat`, `shell: true`, Ctrl-C, closing the window) has been tried on Windows 10 or 11. *Today:* no Windows host was available; `INSTALL.md:39` says "Fully supported".

---

## 3. Build, CI and tests

- ☑ **Blocker** — The unit baseline is green and reproducible: 26 files, 382 tests, `tsc` clean, lint clean, a fresh `next build` with no warnings, lockfile v3 with `npm ci`.
- ☐ **Should** — The Playwright suite (22 specs, 147 tests, the only coverage of the UI, every API route and the middleware) runs in CI, against `next start`, with the demo site seeded. *Today:* not in CI; the config runs `next dev`; the suite needs an undocumented `npx playwright install`. (NVX-029)
- ☐ **Should** — A unit test covers the Origin check and the production CSP directly. *Today:* no test imports `src/middleware.ts`.
- ☐ **Should** — Running `npm run test:e2e` cannot touch a customer's own sites. *Today:* `reuseExistingServer: true` on port 3939 with no `DATABASE_URL` override; the specs issue 86 permanent deletes and fill the trash.
- ☐ **Should** — CI covers the platforms the docs claim: an OS matrix for install, build and unit tests, and a smoke job that starts `node electron/server.js` headless and curls `/`. *Today:* `ubuntu-latest` only.
- ☐ **Should** — The headline features each have an end-to-end test. *Today:* missing for drag from the palette and reorder, unpublish then 404, revision restore through the panel, page duplicate/move/make-home, redo, and the MCP tools over stdio.
- ☐ **Should** — A browser-support statement exists and matches what is tested. *Today:* Desktop Chrome only in Playwright; the editor relies on `contentEditable`, `execCommand` and `beforeunload`, which differ in Firefox and Safari; no statement anywhere.
- ☐ **Nice** — Component and route-handler tests are possible: widen `vitest` include to `.tsx`, use jsdom for components, call route handlers with an in-memory database.
- ☐ **Nice** — ESLint goes beyond `next/core-web-vitals` (type-aware rules, `no-floating-promises`, `eslint-plugin-no-unsanitized` for the `dangerouslySetInnerHTML` sites). *Today:* the move off `next lint` is done — Next 16 removed it, so linting is `eslint .` against a flat config on ESLint 9 — but the rule set is still `next/core-web-vitals` and nothing more.
- ☐ **Nice** — TypeScript enables `noUncheckedIndexedAccess` and `checkJs` for the two launcher scripts a customer runs first.
- ☐ **Nice** — Workflow hygiene: `concurrency`, `timeout-minutes`, artefact upload on failure.

---

## 4. Data: backup, restore, growth and integrity

- ☐ **Blocker** — Backup instructions name everything a customer would lose and are safe while the app runs. *Today:* `INSTALL.md:175` says copy `prisma/dev.db`; a live copy missed the newest site once the file was in WAL mode, and `public/uploads` (every image on every page), `.env` and `prisma/.neuravex-state.json` are never mentioned. *Do:* "quit first, or `sqlite3 prisma/dev.db '.backup …'`; copy `public/uploads` too"; optionally `npm run backup`. (NVX-037)
- ☐ **Blocker** — The web app really runs SQLite in WAL mode. *Today:* the PRAGMAs in `src/lib/prisma.ts:13-15` are never executed; a database the MCP server has touched stays in WAL because the mode persists, a web-only install does not. *Do:* await the PRAGMAs and gate queries on them, or set WAL once in `first-run.js`; assert `journal_mode = wal` in a test and expose it on a health endpoint. (NVX-030)
- ☐ **Should** — A written, tried restore procedure exists (quit, replace `dev.db`, delete stale `-wal`/`-shm`, restore uploads, `npm run setup`, start). *Today:* none; `scripts/db-reset.js` knows the steps, the docs do not.
- ☐ **Should** — The JSON export is described honestly and can be imported from the UI. *Today:* it carries settings and page content only (no uploads, revisions, submissions, media names or saved blocks); the delete dialog offers it as "Download a copy first" but there is no import button and no doc, only `POST /api/sites/import`. *Do:* an "Import site" action beside "New site", and a sentence saying uploads travel separately; longer term a zip export that includes the files.
- ☐ **Should** — Concurrent writers get a retry or a readable message. *Today:* a second process holding a write transaction turns every save into a bare 500 after a five-second stall; no route catches Prisma errors; the editor autosaves 1.5 s after any change, so a stale tab or the MCP agent silently overwrites the other. *Do:* retry on "database is locked", send `updatedAt` with each save and answer 409 on conflict, and say in README that a page should not be open in the editor while an agent edits it.
- ☐ **Should** — The save endpoint refuses a `content` that is not a block array, and every writer rejects malformed trees. *Today:* `{"content":"oops"}` is stored and both the editor and the published page then show an empty page; the previous content survives only as the newest revision. (NVX-014)
- ☐ **Should** — Visitor submissions can be listed in full, exported and deleted, and a retention period can be set. *Today:* `take: 100` with no paging, no CSV, no delete route (cascade on page delete only), while the generated privacy notice quotes a retention period. This is also what a DSGVO subject request needs. (NVX-058)
- ☐ **Should** — Unbounded growth has a story: submissions have no count cap or rate limit (NVX-018), page content has no size cap and `GET /api/media` rescans all of it on every open of the picker (NVX-042), uploads are stored at original size with no unused-files view, trash keeps whole sites with history.
- ☐ **Should** — "Delete forever" in the trash asks first. *Today:* `TrashPanel.tsx:54` deletes on click; the entry is the last copy of a site with its revisions and submissions.
- ☐ **Should** — Data can live outside the checkout, and the docs say the install folder *is* the data directory. *Today:* `DATABASE_URL` can be absolute, but uploads and the state file are hard-coded under the repo; nothing warns that "delete the folder" is "delete my sites".
- ☐ **Nice** — Restoring a revision cancels the pending autosave and snapshots the pre-restore content, so a restore is itself reversible. *Today:* a dirty editor that chooses "Stay" on the reload prompt overwrites the restored content on its next autosave (reasoned from code, not driven in a browser).
- ☐ **Nice** — The schema-evolution policy is written down: `db push` on start, `intentional-drops.json`, what to do when the launcher refuses a lossy change, and how to downgrade (restore the matching backup); `prisma migrate` before 1.0.
- ☑ **Should** — `npm run db:reset` builds the new database beside the live one and only renames on success; `git pull` cannot touch data (all data paths are gitignored). Verified.

---

## 5. Operations

- ☐ **Blocker** — The reverse-proxy recipe leaves the builder reachable only through the proxy, with auth on the admin surface and public access to published sites and the visitor form. *Today:* TLS only; no `auth_basic`, no HSTS, no port-80 redirect, no `X-Forwarded-Host` override, no note that `:3000` must be firewalled or bound to loopback, no `proxy_read_timeout` for the download route; and the download route breaks behind it anyway (NVX-026). (NVX-036)
- ☐ **Should** — The download, sitemap and robots routes work behind an HTTPS proxy. *Today:* they take the scheme from `X-Forwarded-Proto` and self-fetch `https://localhost:3939`, which fails. (NVX-026)
- ☐ **Should** — A cheap `GET /api/health` returns version, database reachability, upload directory writability and journal mode, and the launcher, Docker and the proxy use it. *Today:* the launcher polls `/`, which renders the admin page.
- ☐ **Should** — Logs survive a closed window and swallowed errors say something. *Today:* console only; the launcher writes no file; media DELETE swallows `unlink` failures and returns `ok`; the upload route hides a failed `mediaFile.create`.
- ☐ **Should** — Supervision guidance exists (a systemd unit with `Restart=on-failure`, `--restart unless-stopped` for Docker) and the launcher does not silently exit when its child dies.
- ☐ **Should** — The production checklist says the instance is single-tenant: everyone behind the proxy credential is an administrator of every site, nothing is logged, and the trash keeps the newest 50 items. (NVX-052)
- ☐ **Should** — Reverse-proxy operators are told about the amber "not on this machine" banner, or an env flag swaps it for "access is controlled by your proxy". *Today:* every proxied operator sees a permanent warning telling them to run on localhost.
- ☐ **Should** — Uninstall is documented, including the MCP config `setup-mcp.sh` writes elsewhere on the machine (`~/.config/openai/mcp.json`, overwritten without backup), and `setup-mcp.sh` backs up and merges instead of overwriting. (NVX-053)
- ☐ **Nice** — Graceful shutdown: wait for the child, checkpoint the WAL, and say that `dev.db-wal`/`-shm` belong to the database.
- ☐ **Nice** — A troubleshooting entry for a moved install directory ("Query engine library for current platform could not be found → `npm install`") and for a stale absolute `DATABASE_URL` in an MCP client config (which silently creates an empty database).

---

## 6. Documentation and support

- ☐ **Should** — One port story. *Today:* README and INSTALL say 3000, the recommended `npm run desktop` opens 3939, `setup-mcp.sh` says 3000 and `npm run dev`, and the MCP server's `get_site_url` hands agents `localhost:3000`. (NVX-038)
- ☐ **Should** — The MCP tools table matches the server. *Today:* nine listed, two of which do not exist, nine missing including `publish_page` and `generate_legal_pages`. *Do:* regenerate from the sixteen registrations and add a drift test. (NVX-038)
- ☐ **Should** — README's project layout and data model describe the tree that exists. *Today:* "DOMPurify", pre-route-group paths, two of seven models, no mention of `middleware.ts`, `mcp-server.ts`, `scripts/`, `electron/`, `e2e/` or `src/lib/legal/`.
- ☐ **Should** — `setup-mcp.sh` does what `INSTALL.md` says. *Today:* INSTALL promises Claude Desktop and Cursor; the script echoes about `opencode.json` and writes only a ChatGPT desktop config, without the `env` block the manual instructions include.
- ☐ **Should** — In-app copy does not recommend something the app strips. *Today:* `SiteSettings.tsx:198` tells users to load Google Fonts via `@import` in Custom CSS; `sanitizeCss()` removes `@import`.
- ☐ **Should** — `INSTALL.md` Troubleshooting covers the messages a first-week user will see: "Environment variable not found: DATABASE_URL", "database is locked", "Could not update the database automatically", changing the desktop port, the Windows batch-file flow, the network banner.
- ☐ **Should** — A user guide beyond README: block reference, template list (generated from `TEMPLATES`), keyboard shortcuts (the editor implements Cmd+Z, Shift+Cmd+Z, Cmd+C/X/V/D, Delete, Escape, Ctrl+B/I; README documents Cmd+S), the legal-pages flow.
- ☐ **Should** — `CONTRIBUTING.md` (setup, `npm test`, `npx playwright install` + `npm run test:e2e`, lint, PR conventions) and a "Getting help" section with a real channel. *Today:* neither; no help link in the app.
- ☐ **Should** — Screenshots or a short GIF in README. *Today:* no images anywhere in the repo.
- ☐ **Should** — Known limitations state the scope decisions plainly: the builder is for desktop browsers; sites are downloaded and hosted by you; responsive behaviour is columns and nav only; one user, no accounts; German legal pages only; forms in a downloaded site cannot submit anywhere; the viewer shows 100 submissions.
- ☐ **Nice** — `docs/PRODUCT_REVIEW.md` moves under `docs/internal/` or gets a banner saying every P0 and P1 in it is resolved; `docs/README.md` indexes the user guide.
- ☐ **Nice** — Issue and PR templates (OS, Node version, how the app was started, port, the `[neuravex]` log lines) and a `CODE_OF_CONDUCT.md`.
- ☐ **Nice** — A FAQ: where are my sites, why no login, how do I put the site online, forms on a static host, custom domains.
- ☑ **Nice** — Feature counts in README are right: 13 block types, 28 templates (11 multi-page), 74 bundled photographs. Verified.
- ☑ **Nice** — README's "Using the editor" and URL scheme match the UI; `.env.example` is accurate. Verified.

---

## 7. Legal, licensing and privacy

- ☐ **Blocker** — The German legal texts have been reviewed by a qualified person, and the review date and scope are recorded. *Today:* `src/lib/legal/*` was written in one commit with no reviewer; the feature produces documents the customer publishes under their own liability, through the UI and through the MCP tool. *Do:* a review by a German lawyer or data-protection professional; until then label the feature "Beta" in the UI and README.
- ☐ **Blocker** — The generated Datenschutzerklärung only asserts what the operator confirmed. *Today:* an Art. 28 contract is assumed and the form is said to store nothing, while the builder stores every submission and the exported form GET-navigates the answers into the URL. (NVX-040)
- ☐ **Should** — The notice covers every way a Neuravex site can be served. *Today:* it models only "downloaded and hosted elsewhere"; a site served from the builder itself (reverse-proxy case) gets wrong hosting and form text. *Do:* a "we serve it ourselves" option.
- ☐ **Should** — The licence is declared consistently and the owner is named. *Today:* `LICENSE` is Apache-2.0 with `Copyright [yyyy] [name of copyright owner]` unfilled; `package.json` has no `license`; README has no licence section.
- ☐ **Should** — The runtime dependency inventory is right: `tailwindcss` and `autoprefixer` are loaded at request time by the download route but live in `devDependencies`, so `npm ci --omit=dev` breaks downloads and the licence inventory omits them.
- ☐ **Should** — Someone has read the Unsplash Licence's "no competing service" clause against shipping 74 Unsplash photographs as a searchable, categorised picker, and recorded the conclusion in `public/stock/README.md`. *Today:* attribution and provenance are complete; the clause is unexamined.
- ☐ **Should** — Embeds use privacy-preserving variants where they exist (`youtube-nocookie.com`, Vimeo `dnt=1`), or README says embeds contact third parties and a consent facade is the operator's job. *Today:* the legal flow discloses it; nothing rewrites URLs.
- ☐ **Should** — Operators can answer a DSGVO subject request for form data (see §4: full listing, export, deletion).
- ☐ **Should** — README states the legal feature is German-law only, is not legal advice, and produces German text.
- ☐ **Nice** — Generated legal pages carry a "Stand: <Monat Jahr>" line.
- ☐ **Nice** — A `THIRD-PARTY-LICENSES` file and a photo credits list ship with any packaged distribution; the product name is consistent (`Neuravex` vs `website-builder` vs `neuravex-website-builder`).
- ☐ **Nice** — The one live-TLD placeholder in the templates (`hello@the.studio`, `src/lib/templates.ts:547`) becomes a reserved address.
- ☑ **Should** — The production dependency tree is permissive only (MIT, Apache-2.0, ISC, BSD, one CC-BY-4.0 data package; no copyleft). Verified with `license-checker`.
- ☑ **Should** — The 74 bundled photographs have a complete manifest with credit, URL and licence, no missing or unlisted files, no EXIF or GPS data. Verified.
- ☑ **Should** — Nothing in the builder or the published pages loads external fonts, images or scripts; templates reference `/stock/` only; visitor submissions store no IP, user agent or referrer; nothing about the operator is stored or sent. Verified.
- ☑ **Blocker** — The legal flow and the MCP tool both say the pages are not legal advice and must be read before publishing, and generation refuses while a § 5 DDG field is missing. Verified.

---

## 8. Product quality

- ☐ **Should** — Published sites and the builder have their own 404 and error pages. *Today:* no `error.tsx` or `not-found.tsx`; visitors get Next's stock page.
- ☐ **Should** — Keyboard-only users can reorder blocks and reach every control. *Today:* pointer sensor only, no move up/down buttons, modals do not trap or return focus.
- ☐ **Should** — A CSV download of a page's submissions exists, since the viewer stops at 100.
- ☐ **Nice** — Large-site performance: the pages list loads full `content` just to show titles; `GET /api/media` rescans every page for every file (NVX-042); every download re-renders all pages and recompiles Tailwind with no cache (NVX-043); the revisions panel refetches up to 50 full snapshots after every autosave.
- ☐ **Nice** — Non-Latin site names get a usable slug instead of `untitled`; uploads prompt for a description; images are resized on upload; the download carries a canonical URL and sitemap once a base URL setting exists, and `og:image` stops pointing at `localhost` (NVX-051).
- ☐ **Nice** — The delete-site button moves to a "Danger zone" away from the Save row.
- ☑ **Blocker** — Site and page deletion confirm with counts and go to a trash with restore; the unsaved-changes guard, save-failure state and autosave/manual-save semantics are in place and covered by e2e tests. Verified.

---

## 9. What to say at launch

These are decisions already made in `docs/PRODUCT_REVIEW.md` and the code. They belong in the
release notes and the README's limitations, in these words or plainer ones:

- Neuravex is downloaded software for a desktop browser. It is not hosted and there is no plan to
  host it or the sites it builds.
- There is no sign-in. It is meant to run on your own machine; if you expose it, you provide the
  access control, and this release binds to `localhost` by default (once §1 is done).
- Getting a site online means *Download files* and hosting the folder yourself. Forms in the
  downloaded site have nowhere to send answers unless you point them at a form service.
- Responsive behaviour on published sites is column stacking and a collapsing nav.
- The Impressum and Datenschutzerklärung generator targets German law, writes German text, and is
  not legal advice.
- The MCP server lets an AI agent create, edit and publish sites. Anything the agent reads can
  instruct it; do not leave a page open in the editor while an agent edits it.
