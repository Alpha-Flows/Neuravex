# Changelog

All notable changes to Neuravex are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Where an entry answers a finding in `docs/SECURITY_REVIEW.md`, the identifier
in brackets is the finding it closes.

### Security

- The server binds `127.0.0.1` by default, in the desktop launcher and in
  `npm start` alike. A wider bind needs `HOST` and prints a warning that there
  is no password behind the port. [NVX-003]
- The `Host` header is validated on every request, before the Origin check, so
  a DNS rebinding page can no longer reach the API from a victim's browser.
  `NEURAVEX_ALLOWED_HOSTS` lists the extra names a proxy serves. [NVX-002]
- `X-Forwarded-Host` is honoured only when `NEURAVEX_TRUST_PROXY=1`, and the
  full origin is compared when it is. [NVX-034, NVX-063]
- Link and media URLs in block trees are scheme-checked on every write path and
  again at render, so a `javascript:` button from an import or the MCP server
  cannot run on an exported site. Exported pages carry their own meta CSP.
  [NVX-001]
- Rich text is sanitised on the way into and out of the editor's
  `contentEditable`, and on the server for every text-bearing prop. [NVX-024]
- `style` attributes are parsed and filtered rather than copied verbatim;
  `position: fixed`, `z-index` and `pointer-events` are dropped as well as
  anything that fetches. [NVX-006]
- Colours and lengths written into inline styles are validated, including the
  site accent on the builder's own dashboard. [NVX-007, NVX-008, NVX-066]
- A `class` in text or custom HTML could lift content out of the page the way
  a `style` attribute no longer can — `fixed inset-0 z-50` drew a sheet over
  the published page, the download and the editor. Positioning, stacking,
  negative margins and the app's own component classes are filtered out of
  content now, and a negative margin in a `style` attribute too; an author's
  own class names, such as `top-bar`, are kept. [NVX-006]
- Cutting an over-long rich-text field to its limit could take minutes when
  it held elements nested thousands deep, on every save and every page view.
  It takes a bounded number of passes now, whatever the field holds.
- The exported stylesheet is filtered after Tailwind runs, so an arbitrary
  value in a `class` attribute cannot compile a remote `url()` into the
  customer's site. [NVX-009]
- The iframe allowlist matches hostnames exactly instead of by prefix, and the
  CSP `frame-src` is derived from the same list. Surviving frames are
  sandboxed and their `allow` attribute is restricted. [NVX-023, NVX-067]
- The SVG sanitiser resolves namespace prefixes before deciding whether an
  attribute carries a URL, and its `style` attribute is filtered with the CSS
  parser instead of three regexes. [NVX-025, NVX-044]
- Sanitised `id` attributes are prefixed, so content can no longer take over
  `__next_f` and stop React hydrating the page or the editor. [NVX-045]
- Uploads are served by a route handler with path containment, a fixed content
  type and `nosniff`, which also fixes files 404ing until a restart.
  [NVX-005, NVX-054, NVX-061]
- Uploaded images have their EXIF, XMP and comment metadata — including GPS —
  stripped before they are written. [NVX-059]
- Request bodies are size-checked before they are buffered or parsed, on the
  JSON routes and on uploads. [NVX-016, NVX-017]
- Block trees are schema-validated with depth, node-count and size limits at
  every write boundary. [NVX-013, NVX-014, NVX-015, NVX-049, NVX-S002]
- Form submissions are rate-limited and capped per page. [NVX-018]
- The CSS function scanner is iterative and depth-capped, and `customCss` has a
  byte limit, so a nested stylesheet no longer 500s every page of a site.
  [NVX-019]
- The published page serialises only the columns the renderer needs, instead of
  the whole site row and every page's content. [NVX-S001]
- `style-src` is split into `style-src-elem` (nonced) and `style-src-attr`, and
  violations are reported to `/api/csp-report`. [NVX-033]
- `next` 14.2.35 and `sanitize-html` 2.17.7. [NVX-010, NVX-035]
- `next` 16.3.5 on React 19, up from 14.2.35 on React 18. The `next` 14 line
  is out of support: it carried two unauthenticated remote code executions
  with no 14.x fix — GHSA-p293-qw3h-jr36 on Windows hosts and
  GHSA-2xp9-vwfh-vxw4 through the image optimizer — plus twenty-odd other
  advisories. `npm audit --omit=dev` now reports nothing at all against what
  ships, and the audit gate's allowlist is empty. [NVX-004, NVX-010]
- The `overrides` that pinned `postcss`, `fast-uri`, `hono` and `qs` past
  their advisories are gone. They existed because the dependency pulling each
  one in had not moved; on the Next 16 tree npm resolves every one of them to
  a fixed release on its own, which the gate confirms.
- The image optimizer is off and its wildcard remote patterns are gone.
  [NVX-012]
- `X-Powered-By` is off; `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy` and `Cache-Control: no-store` on `/api` are
  set; `X-DNS-Prefetch-Control` is `off`. [NVX-046, NVX-068, NVX-073]
- Nothing shells out through `npx` any more: local binaries are resolved from
  this repository and run with the Node already running, so a missing package
  fails instead of fetching one from the registry. [NVX-022]
- The launcher stops the whole server process group and waits for it, instead
  of orphaning a server that keeps the port bound. [NVX-031]
- Custom header and footer substitutions escape the values they interpolate.
  [NVX-062, NVX-S002]
- The database and its sidecars are created private to the owner. [NVX-050]
- The MCP server frames every result as site data, requires `confirm: true` to
  delete, and refuses to start against a database with no tables.
  [NVX-S003, NVX-053]

### Added

- Ten blocks: **Gallery**, **Slider**, **Audio**, **Map**, **Accordion**,
  **Icon**, **Social links**, **Table**, **Pricing** and **Code**. A published
  page runs no script of a block's own and a downloaded one runs none at all,
  so everything a visitor opens, closes or steps through is HTML and CSS: a
  gallery picture opens by `:target` and steps to its neighbours by anchor
  links, a slider snaps between slides and moves by links to them, an
  accordion is `<details>` with a shared `name` so opening one closes the
  others. Each block has a panel of its own under
  `src/components/editor/inspectors/`, built from shared controls in
  `inspector-fields.tsx` — including a list editor whose rows can be
  reordered — and each is described in the validator, the privacy audit and
  the page-rename sweep, rich text included.
- The Video block plays a pasted **YouTube or Vimeo** link, from
  `youtube-nocookie.com` or from Vimeo with `dnt=1`, and the privacy notice
  names the provider. Any other address is still played as a file.
- The picture library lists sounds for the Audio block, and a picture picker
  no longer shows a PDF or a font as a broken thumbnail; those are listed
  under "Other files", where they can still be deleted.
- The MCP server's block reference lists the values a block accepts for every
  prop with a fixed set, read from the validator's own schemas, and the icon
  names — since a value outside the set is repaired to a default without a
  word.

- A floating block can be moved to another container without being put back in
  the flow first. A float is placed rather than ordered, so its handle already
  means "move it across the page" and it is not a sortable at all — which left
  it stuck wherever it was made: getting it out meant un-floating it, dragging
  it, and floating it again, losing its position both times. The inspector now
  lists the containers on the page by name, indented the way the outline is,
  and moving is the same remove-and-insert a drag performs. The block keeps its
  level and its position, which are shares of whatever it floats in.
- Error and 404 pages, in the builder and on published sites. `block-tree.ts`
  was written because a malformed block tree became "a durable 500 the owner
  could not click past"; it stops one being stored, but nothing caught what a
  render still threw, and every page is `force-dynamic`, so each one is a live
  database read that can fail on its own. There is now a `not-found.tsx` and
  an `error.tsx` beside each root layout — one per layout, because both live
  inside route groups, and a single file at the top would render above both
  `<html>` elements — and a `global-error.tsx` for a throw in a root layout
  itself, which is the only thing that could catch the published layout's own
  query. None of them shows the error's message, which on a client-side throw
  arrives intact and can carry a filesystem path or a fragment of SQL; the
  digest is shown instead, which is what matches the line in the terminal.

- **Depth.** Every block now carries a level, and can be lifted out of the flow
  to float over its neighbours — so a headline can sit on a photograph instead
  of pushing it down the page. The inspector has a Depth panel (in the flow or
  floating, a level, bring to front / send to back, and the three percentages a
  float is placed by); on the canvas a float is dragged by its ✥ handle, sized
  by the bar on its right edge, and nudged with the arrow keys. Placement is a
  share of the area the block floats in, so it holds at every window width, and
  it carries through to the published page and the downloaded site.
- `SECURITY.md`, this changelog, and a filled-in licence. [NVX-039]
- `npm run backup`, which takes a consistent snapshot of a live database and
  copies the uploads with it. [NVX-037]
- `DELETE /api/submissions/[id]`, a retention sweep, paging and CSV/JSON export
  in the submissions viewer. [NVX-058]
- A tested `Dockerfile` and `.dockerignore`. [NVX-011]
- A browser-test job and an advisory report in CI, with actions pinned by
  commit and a `permissions:` block; `dependabot.yml`. [NVX-029, NVX-060]
- `scripts/audit-gate.js`, which is what now fails the build on a **high or
  critical** advisory in a production dependency. The step it replaces was
  `npm audit --omit=dev --audit-level=critical`, which fails on the two
  criticals the out-of-support `next` 14 line carries — so it could never
  pass, and a check that cannot pass is one people stop reading. An advisory
  may be accepted only by id, with the finding and the mitigation it rests on
  and a `holds()` that re-reads that mitigation on every run, so an exception
  lapses in the commit that breaks it. An advisory at or above the floor that
  nobody wrote down still fails, and an entry whose advisory has gone fails
  too, so the list cannot quietly outlive its reasons.
  The floor was `critical` while Next 14 made `high` undrawable. Next 16
  closed that, and with the production tree reporting nothing at any severity
  the floor is `high` — raised at the moment it cost nothing, rather than when
  something was already failing against it. The allowlist is empty.
  [NVX-004, NVX-012, NVX-029, NVX-065]

### Changed

- Next.js 16 renames what the framework calls things, and the app follows:
  `src/middleware.ts` is `src/proxy.ts` and exports `proxy`; `params` and
  `searchParams` on a page, a layout and a route handler are Promises, so the
  twenty places that read one now await it; `headers()` is awaited too;
  `experimental.serverComponentsExternalPackages` is `serverExternalPackages`.
  Builds run on Turbopack, which is the default in 16.
- `next lint` was removed in Next 16, so linting is `eslint .` against a flat
  `eslint.config.mjs` on ESLint 9. Two rules that arrived with it are written
  down rather than silently disabled: `react-hooks/set-state-in-effect` is a
  warning, because every instance is a value the server cannot know read after
  mount to avoid a hydration mismatch, and `react-hooks/refs` is off for the
  two files that use dnd-kit, whose hook returns plain values beside a ref
  setter and trips the rule for reading them. It caught one real write of a
  ref during render in `FormattingToolbar`, which is fixed.
- Node 22.12 is the documented and enforced minimum, in `.nvmrc`, `engines`,
  the Dockerfile and the install guide. It was Node 20 (NVX-028), and the
  `sanitize-html` bump that closed NVX-035 raised the floor under it:
  `sanitize-html` declares `node >=22.12.0` from 2.17.6 onward, and `.npmrc`
  sets `engine-strict=true`, so `npm ci` refused to install on 20 and every
  CI job died before it could build or test anything. [NVX-028, NVX-035]
- The legal wizard asks about the hosting DPA and what happens to form input
  instead of assuming answers, and the generated text matches how the site is
  actually served. [NVX-020, NVX-040]
- The privacy audit reads the sanitised HTML the renderer produces, so a
  tracker in a text block is found and a plain hyperlink is no longer reported
  as one. [NVX-021, NVX-056, NVX-057]
- `INSTALL.md`'s reverse-proxy recipe is safe as pasted, and its MCP tool table
  is generated from the server's own registrations. [NVX-036, NVX-038]
- `docs/LAUNCH_CHECKLIST.md` describes the repository again. It was written
  against `8e56c06` and never revisited, so it read as a list of things nobody
  had started: forty-four items were done and still open, and twenty-three
  references pointed at code that had moved — every mention of
  `src/middleware.ts` among them. It also contradicted itself, demanding an
  image-optimizer change three lines below the entry recording that change as
  made. Each state has been re-verified against the source and carries the
  `file:line` that proves it; the items that are genuinely half-done now say
  which half is missing rather than describing the whole thing as untouched.
  The counts in it and in `docs/PRODUCT_REVIEW.md` come from a real run
  (574 unit tests in 32 files, 169 browser tests in 24 files) instead of three
  different stale numbers.

### Fixed

- Renaming a page moved the links in buttons, plans and custom HTML but not the
  ones the formatting toolbar writes into text, list items, FAQ answers, table
  cells, plan features and captions, which were left pointing at a 404. The
  privacy audit and the rename sweep now read one description of where rich
  text lives (`src/lib/rich-text-props.ts`).
- The download rewrote an address written in a picture's description or a
  code sample's file name, and copied the file it named into the zip. Only
  attributes that hold an address are rewritten now.
- A Vimeo frame pasted into custom HTML was not asked not to track, though the
  privacy notice said every Vimeo player was. Every `player.vimeo.com` frame
  carries `dnt=1` now.
- A Vimeo direct-file address (`player.vimeo.com/external/…`,
  `…/progressive_redirect/…`) was taken for a Vimeo page and dropped from the
  published page and the download. It plays as a file again.
- A video file could no longer be uploaded anywhere once the picture library
  stopped taking files that are not pictures. The Video block's panel opens a
  video library, and "Other files" in the picture library takes a document
  and copies its address for a button's link.
- A link in a revision's preview walked out of the editor, and with it any
  unsaved work.
- With the focus on an outline row, Delete, duplicate and the arrow keys did
  nothing to the block it named; only keys pressed in the inspector or a
  dialog are left to it now.
- A block whose id was empty drew the same anchors as a block called `block`,
  so two galleries opened each other's pictures. An empty id is replaced like
  a missing one.
- A link left inside another by the sanitiser was separated only by the next
  save, so the same text came back different each time until it settled.
- Sanitising was not idempotent: an in-page link gained another `c-` on every
  save and pointed at nothing, and text was cut to its limit before it was
  escaped, so every read cut a long answer again. A plain-text prop that was
  one character too long was emptied rather than cut.
- Two blocks could share an id, and a link inside a button's label nested one
  anchor in another, which rebuilt the published page in the browser and
  split the button in the download.
- The download dropped a `#fragment` or `?query` link to another page, left
  every section and column background out of the zip (React writes the
  quotes of `url("…")` as `&quot;`, which the rewrite did not match), and
  rewrote text that only looked like a path.
- Uploaded sound and video could not be seeked on the published page: the
  uploads route ignored `Range`. It answers with the part asked for now.
- The privacy audit read `/\host` and `\\host` as paths on this site.
- With the focus on a button in the inspector, Backspace deleted the block
  being edited.
- A published page inherited the builder's dark `color-scheme`, so the
  browser's own controls were dark there and light in the download.

- A stale `node_modules` says so. `git pull` brings new source and not new
  dependencies, so a pull across a major leaves the code and the framework it
  runs on disagreeing — and what surfaces then is whatever breaks first, which
  is rarely anything to do with installing. React 18 under React 19 source
  reported "Maximum update depth exceeded" from inside the drag-and-drop
  library, with a stack pointing at somebody else's code entirely. Every
  command now checks the majors of `next`, `react` and `react-dom` against
  what `package.json` asks for and says `run npm install` when they differ.
  A warning, not a refusal: a wrong hint must not be what stops somebody
  working.
- A missing `DATABASE_URL` names the command that was not run. `.env` is not
  in the repository — `npm run setup` and the desktop launcher write it — so a
  checkout that has only had `npm install` run on it produced a Prisma
  validation error pointing at a line of `schema.prisma`, which says nothing
  about the step that was skipped.
- The eight `react-hooks/set-state-in-effect` warnings the Next 16 migration
  left behind are gone, and the rule is an error. They were written up as one
  problem with one defence — a value the server cannot know, read after mount
  so the first render matches the HTML it sent — but they were three, and only
  four of them had that defence. A client-only value read once is now
  `useSyncExternalStore` with a server snapshot, which is React's own API for
  the question and does not cost the extra render. The folded-rails preference
  and the clipboard label were state copied out of `localStorage` and re-seeded
  on mount; they are read from the store that already holds them, so the two
  copies cannot disagree and the first paint no longer shows the wrong one.
  State that was reset by an effect watching a prop is now reset by unmounting
  (the delete confirmation and the picture library keep nothing from the last
  time they were open) or in the handler that caused the change (picking a page
  of form answers clears the previous page's as it asks for the new ones,
  rather than a frame later).
- An empty section can be moved into. Whether a block could hold other blocks
  was read off its `children` array, and `normalizeBlockTree` drops an empty
  one rather than storing it — so a section with nothing in it looked like a
  block that holds nothing, which is exactly the container you most want to put
  the first block into.
- Saved blocks go through the shared block-tree validator. A saved block is
  not a note about a block: it is stored markup that a later click drops
  straight into a page, which makes the route a write path into a block tree
  like save, import, paste and the MCP server — and it was the one guarding
  with a local `isBlock()` that asked only whether `id` and `type` were
  strings. A `javascript:` href, a `style` that fetches, or a tree deep enough
  to overflow the stack was stored verbatim and inserted verbatim. It is now
  checked on the way in and again on the way out, since rows kept by an
  earlier version are already in the database and the picker is where one
  becomes part of a page.
- The last three routes that read a request body with an uncapped
  `req.json()` — saved blocks, revision restore and the legal profile — read
  through the size-checked reader the rest of the API already used. No route
  in `src/app/api` calls `req.json()` now. The legal routes keep an absent
  body distinct from an empty one, so generating from the details on file
  still works.
- The editor read a page's content with a bare `JSON.parse` in a `try`/`catch`
  — the one read path that trusted the database rather than checking it. It
  survived malformed JSON but handed the editor whatever the array happened to
  contain. It now goes through `normalizeBlockTree`, like every other read and
  write path.
- `npm run desktop` rebuilds when the source has moved. It asked only whether
  `.next` existed, so `git pull && npm run desktop` served the previous
  bundle — and served it against a database the same launcher had just
  migrated to the new schema, which is the one pairing nothing else in the app
  is written to survive. `INSTALL.md` had promised a rebuild the whole time.
  The launcher now compares the source against a fingerprint recorded beside
  the schema fingerprint in `prisma/.neuravex-state.json`, and `npm run build`
  records it too, so building by hand and launching do not build twice. The
  fingerprint is a walk of paths, sizes and timestamps rather than a hash of
  the contents: `public/` is 53 MB of bundled photographs, and the walk takes
  about 18 ms. An existing install with no fingerprint recorded is judged on
  whether the bundle is newer than every source file, so updating does not
  force a build that is not needed. A failed build now stops the launcher
  instead of falling through to serve the old one.
- `npm run test:e2e` builds its own database instead of using yours. It ran
  against whatever `.env` named — on a developer's machine, their real sites —
  and the specs clean up after themselves with ninety-five permanent deletes,
  so a run in the wrong place emptied the trash on the way out. Adding a
  `DATABASE_URL` to the Playwright config would not have been enough:
  `reuseExistingServer` was on, and the port it watched is the desktop
  launcher's, so a developer with Neuravex open had their running app adopted
  as the server under test. The suite now builds and seeds a throwaway
  database and upload directory under `data/e2e/`, never adopts a server it
  did not start, and proves before the first test that the server it is
  talking to is reading that database and not another one.
- The SQLite PRAGMAs the web app documents are actually executed. [NVX-030]
- The download, sitemap and robots routes no longer derive their origin from a
  client-supplied `X-Forwarded-Proto`. [NVX-026, NVX-051]
- A malformed percent-encoded asset reference skips that reference instead of
  failing the whole download. [NVX-041]
- The upload route answers 400 on a malformed request instead of 500.
  [NVX-047]

## [0.1.0]

First release.
