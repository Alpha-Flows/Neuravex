# Response to the security review

Every finding in [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md), what was done
about it, and where. Read alongside `CHANGELOG.md`, which groups the same work
by release.

Two findings are **stated rather than closed**, and both say so in their row.
Everything else is fixed.

---

## High

| ID | What was done | Where |
| --- | --- | --- |
| NVX-002 | `Host` is validated on every method before anything else, and before a CSP nonce is minted. Loopback names and IP literals pass (an IP literal cannot come from a DNS flip); anything else needs `NEURAVEX_ALLOWED_HOSTS`. Everything else gets `421 Misdirected Request`. Verified against the running production build: a foreign `Host` is refused on `GET` and on `POST` even when `Origin` matches it. | `src/middleware.ts`, `src/middleware.test.ts` |
| NVX-003 | The desktop launcher and `npm start` both bind `127.0.0.1`. Widening needs `HOST`, and doing so prints a warning that there is no password behind the port. The Docker run line publishes to `127.0.0.1` only. `NetworkNotice` is unchanged; the bind is what makes it a belt-and-braces measure rather than the only one. | `scripts/local-bin.js`, `scripts/start.js`, `electron/server.js`, `Dockerfile` |
| NVX-001 | `isSafeHref()` allows `http`, `https`, `mailto`, `tel`, relative paths and fragments, and nothing else. It runs on every write path through `normalizeBlockTree()`, and again in `ButtonBlock` at render for rows written before it existed. Exported pages carry `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; …">`. The formatting toolbar refuses a scheme it does not support. | `src/lib/url-safety.ts`, `src/lib/block-tree.ts`, `src/components/blocks/ButtonBlock.tsx`, `src/lib/static-export.ts` |
| NVX-004 | **Stated, not closed.** The migration to 15.5.x/16.x is a major piece of work (React 19, async `params`/`headers`/`cookies`, the CSP-nonce middleware re-tested) and is not in this change. Every mitigation the finding names is: loopback by default, `images: { unoptimized: true }` with the remote patterns deleted, `sharp` not installed, and `INSTALL.md` stating that Windows hosts must stay loopback-only. `next@14.2.35` takes the two patches the 14.x line does have. | `next.config.js`, `package.json`, `INSTALL.md` |

## Medium

| ID | What was done | Where |
| --- | --- | --- |
| NVX-010 | `next@14.2.35`. | `package.json` |
| NVX-024 | `sanitizeInlineHtml()` — a tight profile of what the formatting toolbar can produce — runs on the way into the `contentEditable` and on the way back out to autosave, and server-side over every text-bearing prop. | `src/lib/sanitize.ts`, `src/components/blocks/Editable.tsx`, `src/lib/block-tree.ts` |
| NVX-006 | The `style` attribute is parsed declaration by declaration and judged by the same `declarationIsSafe()` the site's own stylesheet uses, plus a second list for the properties that take over the page rather than fetch (`position`, `z-index`, `inset`, `transform`, `pointer-events`, custom properties). The file header no longer claims something untrue. | `src/lib/css-safety.ts`, `src/lib/sanitize.ts` |
| NVX-007 | `cssColor()` and `cssLength()` validate every value written into an inline style, at every sink the finding names, and again at the write boundary so a bad value never persists. | `src/lib/css-value.ts`, `src/components/blocks/*.tsx`, `src/lib/block-style.ts` |
| NVX-008 | `resolveSiteAccent()` checks the colour instead of handing the request back; `safeAccent()` guards the three render sinks, including the builder's own dashboard; the PATCH route, `siteCreateData()` and trash restore all go through `normalizeSiteFields()`. | `src/lib/templates.ts`, `src/lib/site-fields.ts` |
| NVX-009 | The compiled export stylesheet is walked with postcss after Tailwind runs and every declaration whose `url()`/`image-set()` argument is not local is removed, along with any `--tw-content` carrying a `url(`. | `src/lib/export-css.ts` |
| NVX-023 | One module holds the embed hostnames; `isAllowedEmbed()` parses with `new URL()`, requires `https:`, refuses userinfo and matches the whole hostname. The CSP `frame-src` is derived from the same array. | `src/lib/embed-hosts.ts`, `src/middleware.ts`, `src/lib/sanitize.ts` |
| NVX-025 | The SVG sanitiser resolves an attribute's local name before testing it, and drops any attribute carrying a prefix other than `xml`/`xlink`/`xmlns`. `a` is gone from the tag list. | `src/lib/security.ts` |
| NVX-011 | A tested `Dockerfile` and `.dockerignore` ship in the repository: schema copied before `npm ci`, `npm prune --omit=dev` in the runner, `DATABASE_URL` and `NEURAVEX_UPLOAD_DIR` set, one `/data` volume, `USER node`, a `HEALTHCHECK`, and an entrypoint that applies the schema before starting. The run line binds loopback. | `Dockerfile`, `.dockerignore`, `INSTALL.md` |
| NVX-012 | `images: { unoptimized: true }`; `remotePatterns` deleted. | `next.config.js` |
| NVX-013 | `clampSortOrder()` keeps the value inside the 32-bit column, at the PATCH route and on import. | `src/lib/block-tree.ts` |
| NVX-014 | Per-type zod schemas for every block's props, enforced at save, PATCH, page create, import, the MCP tools and paste. `safeProps()` repairs a legacy row at render, and `BlockBoundary` catches what that does not — so a block nobody can draw is one gap on the page rather than a 500 on the editor the owner needs to fix it with. | `src/lib/block-tree.ts`, `src/components/blocks/BlockBoundary.tsx` |
| NVX-015 | Depth (32), node count (5000) and a running byte budget, at every write boundary. The legal audit's walk is depth-capped to the same number. | `src/lib/block-tree.ts`, `src/lib/legal/audit.ts` |
| NVX-016 | `readJsonObject()` checks `Content-Length`, then counts the body stream and abandons it at the limit — before `JSON.parse`. Import gets a larger cap and a page-count cap of its own. | `src/lib/request-body.ts` |
| NVX-017 | `Content-Length` is checked before `formData()`, and the arrived byte count after it. | `src/app/api/upload/route.ts` |
| NVX-018 | Ten submissions per client per minute per page (429 with `Retry-After`), a five-thousand-row cap per page, and a proxy-level `limit_req` in the nginx recipe. | `src/lib/rate-limit.ts`, `src/app/api/submissions/route.ts`, `INSTALL.md` |
| NVX-019 | `cssFunctionCalls()` is iterative with an explicit work list, a depth cap and a total call cap; a value past either yields a call nothing treats as safe. `sanitizeCss()` guards the declaration walk as well as the parse, and has a byte cap. | `src/lib/css-safety.ts` |
| NVX-020 | Exported forms get `onsubmit="return false"` — an inline attribute survives the script strip — and a visible note saying the form cannot send anything and why. The generated privacy text no longer claims input stays in the browser. | `src/lib/static-export.ts`, `src/lib/legal/datenschutz.ts` |
| NVX-021 | The audit reads the *sanitised* form of every rich-text prop and every custom HTML block — what the browser is actually handed — parsed with `htmlparser2`. The inline-text profile from NVX-024 means a tracker in a Text block no longer renders either, so the audit's silence is now the truth rather than a blind spot. | `src/lib/legal/audit.ts` |
| NVX-045 | Every `id` in sanitised content is prefixed `c-`, and `href="#…"` anchors are rewritten to match. | `src/lib/sanitize.ts` |
| NVX-022 | Nothing shells out through `npx`. `scripts/local-bin.js` resolves the package from this repository and runs its `bin` entry with `process.execPath`; a missing package fails with "run npm install". `prisma`, `tsx`, `tailwindcss` and `autoprefixer` moved to `dependencies`. `setup-mcp.sh`, `opencode.json` and `INSTALL.md` all emit the resolved form with an explicit `cwd`. | `scripts/local-bin.js`, `package.json`, `setup-mcp.sh`, `opencode.json` |
| NVX-S001 | The published page `select`s the columns the renderer needs and passes small objects to the client components, instead of handing them the whole row with every page's content included. | `src/app/(published)/sites/[siteSlug]/[[...pageSlug]]/page.tsx` |

## Low

| ID | What was done | Where |
| --- | --- | --- |
| NVX-005 | Uploads moved out of `public/` — Next snapshots that directory when it builds — and are served by a route handler that resolves one path segment inside the upload directory, refuses a symbolic link, and sends a content type taken from the extension with `nosniff`. Verified against `next build && next start`: an upload is served on the next request. | `src/app/uploads/[name]/route.ts`, `src/lib/uploads.ts` |
| NVX-026 | `internalOrigin()` (loopback, plain http, nothing a client can influence) for the download's own fetch; `publicOrigin()` (`PUBLIC_URL`, or forwarded headers under `NEURAVEX_TRUST_PROXY`) for the sitemap and robots. The fetch is wrapped so a failure is the 502 this route means. | `src/lib/self-origin.ts` |
| NVX-027 | `normalizeSiteFields()` is shared by the settings PATCH, `siteCreateData()`, trash restore and MCP `create_site`; `favicon` and `ogImage` are scheme-checked. | `src/lib/site-fields.ts` |
| NVX-028 | `"engines": { "node": ">=20" }`, `.nvmrc`, `engine-strict=true`, and "Node 20 LTS or newer" in both documents. CI reads `.nvmrc`. | `package.json`, `.nvmrc`, `.npmrc`, `README.md`, `INSTALL.md` |
| NVX-029 | `src/middleware.test.ts` covers the Origin check, the `Host` check, the forwarded-header rules and the production CSP. CI gained an `e2e` job that installs Chromium, builds, and runs the browser suite. | `src/middleware.test.ts`, `.github/workflows/ci.yml` |
| NVX-030 | The PRAGMAs are awaited, and a `$extends` hook makes every query wait for them. | `src/lib/prisma.ts` |
| NVX-031 | The launcher spawns the Next entry point directly (no shell), signals the process group on POSIX and `taskkill /T` on Windows, and waits for the exit with a SIGKILL fallback. | `electron/server.js`, `scripts/local-bin.js` |
| NVX-033 | `style-src` splits into a nonced `style-src-elem` and a permissive `style-src-attr`; the app's own `<style>` elements carry the nonce; `report-uri /api/csp-report` logs one line per violation. | `src/middleware.ts`, `src/app/api/csp-report/route.ts` |
| NVX-035 | `sanitize-html@2.17.7`. | `package.json` |
| NVX-036 | The nginx recipe is safe as pasted: port-80 redirect, HSTS, `client_max_body_size`, `proxy_set_header X-Forwarded-Host $host`, `auth_basic` at server level with `auth_basic off` on `/sites/`, `/uploads/` and `POST /api/submissions` only, rate limiting on the form, `proxy_read_timeout` for the download — and a paragraph explaining why exempting `/api/` wholesale is the thing not to do. | `INSTALL.md` |
| NVX-037 | `npm run backup` takes a consistent snapshot with `VACUUM INTO` and copies the uploads with it. The advice to copy `prisma/dev.db` is gone, with an explanation of why it lost data. | `scripts/backup.js`, `INSTALL.md` |
| NVX-038 | `get_site_url` uses `PUBLIC_URL` or the launcher's port; the tool table in `INSTALL.md` lists all sixteen registered tools and a test fails when it drifts; the README no longer names a sanitiser the code does not use; versions are read from `package.json` in both places. | `mcp-server.ts`, `INSTALL.md`, `README.md`, `src/lib/mcp-server.test.ts` |
| NVX-039 | `SECURITY.md` (private contact, scope, the "no auth by design" statement, supported versions), `CHANGELOG.md`, `"license": "Apache-2.0"`, and the licence's copyright line filled in. | `SECURITY.md`, `CHANGELOG.md`, `LICENSE`, `package.json` |
| NVX-040 | `hostingDpa` and `formFate` are tri-state with no default; `missingFor()` requires them when a host or a form is present; the Art. 28 sentence is emitted only when confirmed; the "stored nowhere" sentence is replaced with text that matches how the site is actually served. | `src/lib/legal/profile.ts`, `src/lib/legal/datenschutz.ts`, `src/components/admin/LegalFlow.tsx` |
| NVX-062 | `escapeHtml()` on every interpolated value and function replacers, so `$&`, `` $` `` and `$'` are inert. | `src/components/public/SiteChrome.tsx` |
| NVX-034 | `x-forwarded-host` counts only under `NEURAVEX_TRUST_PROXY=1`; the nginx example sets it from `$host`. | `src/middleware.ts`, `INSTALL.md` |
| NVX-041 | `decodeURIComponent` is guarded — one bad reference is one missing picture — and the per-page loop returns the 502 naming the page. | `src/lib/static-export.ts`, `src/app/api/sites/[id]/download/route.ts` |
| NVX-042 | The usage scan filters in SQL before any page content is read into the process. | `src/app/api/media/route.ts` |
| NVX-043 | The compiled stylesheet is cached by a hash of the documents that made it, most-recently-used, eight deep. | `src/lib/export-css.ts` |
| NVX-044 | `sanitizeSvgStyle()` is gone; the attribute goes through `sanitizeStyleAttribute()`, and `image-set()`, `image()` and `src()` are treated like `url()`. | `src/lib/security.ts`, `src/lib/css-safety.ts` |
| NVX-046 | `poweredByHeader: false`; `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` set to `same-origin`; HSTS in the proxy recipe. | `next.config.js`, `INSTALL.md` |
| NVX-047 | `formData()` is wrapped and a non-`File` part is checked; both answer 400. | `src/app/api/upload/route.ts` |
| NVX-048 | `allowedSchemesByTag` allows `data:` on media tags only; `_blank` anchors get `rel="noopener noreferrer"`; the toolbar refuses an unsupported scheme. | `src/lib/sanitize.ts`, `src/components/blocks/FormattingToolbar.tsx` |
| NVX-049 | The archive is validated at the boundary, slugs are de-duplicated across the archive, and the import route answers 400 rather than letting a malformed archive reach Prisma. | `src/lib/site-archive.ts`, `src/app/api/sites/import/route.ts` |
| NVX-050 | The database and its sidecars are `chmod 0600` after connect; the launcher sets `umask(0o077)`; the production checklist says to run it as its own user. | `src/lib/prisma.ts`, `electron/server.js`, `INSTALL.md` |
| NVX-051 | `metadataBase` comes from `publicOrigin()`, and an absolute self-reference is rewritten to a relative one before assets are collected — so the file is bundled and the link works. | `src/app/(published)/…/page.tsx`, `src/lib/static-export.ts` |
| NVX-052 | **Stated, not closed.** Single-tenancy, the absence of an audit trail and the trash's 50-item cap are properties of the design. They are written down in `SECURITY.md` and in `INSTALL.md`'s "Multiple people" section rather than left for an operator to find out. | `SECURITY.md`, `INSTALL.md` |
| NVX-053 | `setup-mcp.sh` skips a client that is not installed, backs up a config before replacing it, handles Claude Desktop as well, and writes a resolved `node …/tsx/dist/cli.mjs` command with a `cwd`. The MCP server loads this repository's `.env`, makes a relative `DATABASE_URL` absolute, and refuses to start against a database with no tables. | `setup-mcp.sh`, `mcp-server.ts` |
| NVX-054 | Uploads are `lstat`ed before being served, listed with `withFileTypes` and filtered to regular files, and the exporter checks containment and `isFile()` before reading. Moving uploads out of `public/` closes the path Next's static handler used to serve. | `src/lib/uploads.ts`, `src/app/api/media/route.ts`, `src/app/api/sites/[id]/download/route.ts` |
| NVX-055 | `CHECKPOINT_DISABLE=1` joins `NEXT_TELEMETRY_DISABLED=1` in one place every child process inherits, and every npm script goes through it. `INSTALL.md` has a paragraph on offline installs and `PRISMA_ENGINES_MIRROR`. | `scripts/local-bin.js`, `package.json`, `INSTALL.md` |
| NVX-056 | The audit parses with `htmlparser2` and collects `src`, `srcset`, `link href`, `action`, `poster`, `xlink:href` and `url()` in style attributes. | `src/lib/legal/audit.ts` |
| NVX-057 | `href` counts as a load only on `<link>`, `<use>` and `<image>`; anchors go into a separate `linkHosts` list that never feeds `remoteHosts`. | `src/lib/legal/audit.ts` |
| NVX-058 | `DELETE /api/submissions/[id]`, a whole-page delete, a "delete older than" sweep, paging with a total, and CSV/JSON export in the viewer. | `src/app/api/submissions/…`, `src/app/api/pages/[id]/submissions/route.ts`, `src/components/admin/SubmissionsViewer.tsx` |
| NVX-059 | `stripImageMetadata()` drops APP1/APP13/COM from JPEG (re-emitting a minimal orientation tag), `eXIf`/`tEXt`/`iTXt`/`zTXt`/`tIME` from PNG, and `EXIF`/`XMP` from WebP, before the bytes are written. | `src/lib/uploads.ts` |
| NVX-060 | `permissions: contents: read`, actions pinned by commit with the tag in a comment, `persist-credentials: false`, an advisory job that reports everything and fails on a critical production advisory, and `dependabot.yml` for npm and actions. | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| NVX-061 | `matchesType(ext, bytes)` checks the magic bytes against the extension and answers 400 on a mismatch; non-image types are served `Content-Disposition: attachment`. | `src/lib/uploads.ts`, `src/app/uploads/[name]/route.ts` |
| NVX-S002 | `normalizeArchivePages()` slugifies and de-duplicates, keeps one home page and one page per legal kind; `SiteChrome` URL-encodes and HTML-escapes the values it interpolates. | `src/lib/site-archive.ts`, `src/components/public/SiteChrome.tsx` |
| NVX-S003 | Every MCP read result is wrapped in an envelope naming it as stored site data; `delete_site` and `delete_page` take one thing and require `confirm: true`; `INSTALL.md` and `setup-mcp.sh` both say not to share a session with untrusted material. | `mcp-server.ts`, `INSTALL.md`, `setup-mcp.sh` |

## Info

| ID | What was done | Where |
| --- | --- | --- |
| NVX-063 | The full origin is compared, including the scheme, wherever the proxy reports it. | `src/middleware.ts` |
| NVX-064 | `sourceMappingURL` comments are stripped before the CSS parse, so a downgrade cannot make the passthrough live. | `src/lib/security.ts` |
| NVX-065 | The audit job reports every advisory and fails only on a critical one in production dependencies, with the Next.js 14 situation named in a comment. | `.github/workflows/ci.yml` |
| NVX-066 | `sanitizeCssValue()` no longer keeps quotes; `cssFontStack()` re-adds them around a cleaned value; `safeAccent()` normalises a hex without its `#`. | `src/lib/css-value.ts`, `src/lib/site-fields.ts` |
| NVX-067 | `allow` is replaced with the tokens a player needs, and surviving frames are sandboxed; the export carries its own meta CSP. | `src/lib/embed-hosts.ts`, `src/lib/sanitize.ts` |
| NVX-068 | `Cache-Control: no-store` on `/api/:path*`. | `next.config.js` |
| NVX-069 | A root `robots.ts`, and `robots: { index: false, follow: false }` on the builder layout. | `src/app/robots.ts`, `src/app/(builder)/layout.tsx` |
| NVX-070 | `rel="noopener noreferrer"` on all three. | `src/components/editor/PublishButton.tsx`, `src/app/(builder)/admin/sites/[id]/page.tsx` |
| NVX-071 | `\p{Cf}` stripped and NFC normalisation applied to media names and alt text. | `src/lib/media.ts` |
| NVX-072 | `tsconfig.tsbuildinfo` removed from the repository and added to `.gitignore`. | `.gitignore` |
| NVX-073 | `X-DNS-Prefetch-Control: off`. | `next.config.js` |

---

## What is worth knowing that the review did not say

**The style-attribute filter no longer uses postcss.** `security.ts` imports
postcss, and two of the callers the fix needed — the formatting toolbar and the
inline-text sanitiser — are client components. Importing that module from one
pulls a Node build tool into the browser bundle and the page stops rendering,
which it duly did. The value-level checks now live in `css-safety.ts` and
`url-safety.ts`, which have no dependencies at all, and
`sanitizeStyleAttribute()` splits declarations with the same
quote-and-escape-aware scanner the call reader uses.

**NVX-009 demonstrated itself during the fix.** Writing the example class names
(`[cursor:url(…)]`, `content-[url(…)]`) into a doc comment in `src/lib/` was
enough for Tailwind to compile them into `globals.css` and break the build,
because the content globs cover that directory. The comment is reworded; the
finding is exactly right about how little it takes.
