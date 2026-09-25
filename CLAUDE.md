# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Neuravex is a visual website builder people download and run on their own machine. Next.js 16
(App Router) + React 19 + Tailwind, SQLite through Prisma. No hosting, no accounts, no sign-in,
nothing phoning home. Sites leave as a folder of plain HTML the customer hosts elsewhere.

## Commands

```bash
npm run setup          # .env, database, schema, demo site — idempotent
npm run dev            # dev server on :3000
npm run build          # production build, and records the source fingerprint
npm run desktop        # the launcher a customer runs: first-run, rebuild if stale, open a browser (:3939)
npm run lint           # must be 0 errors AND 0 warnings
npm test               # vitest
npm run test:e2e       # Playwright — needs a current `npm run build` first
npm run db:reset       # rebuild the database beside the live one, swap only on success
npm run backup
npm run mcp            # the MCP server over stdio
node scripts/run-local.js typescript --noEmit    # typecheck
node scripts/audit-gate.js                       # the advisory check CI fails on
```

One unit file, or one case:

```bash
npm test -- src/lib/block-tree.test.ts
npm test -- src/lib/block-tree.test.ts -t "drops a node"
```

One browser spec (arguments pass straight through to Playwright):

```bash
npm run build && npm run test:e2e -- e2e/public.spec.ts
```

**Never run `npx`, and never put a bare binary name in a package script.** Everything goes
through `scripts/run-local.js` → `scripts/local-bin.js`, which resolves the locally installed
package and runs it with the current Node. `npx` with a non-TTY stdin silently fetches whatever
the registry calls latest — for `prisma` that once meant a two-majors-ahead `db push` against
the only copy of somebody's sites. The same applies to anything you write into docs or an MCP
config snippet.

`childEnv()` precedence is `.env` < `process.env` < offline flags < the caller's `extra`. That
ranking is what lets the e2e wrapper redirect `DATABASE_URL` without any application code
knowing a test is running.

## Architecture

### The block tree is the product

A page's content is a JSON string on `Page.content` holding an **array** of `BaseBlock`
(`src/types/index.ts`): `{ id, type, props, children?, column?, layer? }`. `props` is
deliberately `any` and each block type has a zod schema instead.

`src/lib/block-tree.ts` is the single description of a valid tree, and **every write path goes
through it** — the editor save, PATCH, page and site creation, saved blocks, import, clipboard
paste and the MCP server, thirteen call sites in all. Both read paths (the editor page and the
published page) run it too, because rows written before it existed are still in customers'
databases. Read its header before changing anything here: it names the four concrete failures
that produced it.

Its rule is **repair, don't reject**: per-field `.catch()` so a mistyped prop falls back rather
than losing the author's whole save. Only an unparsable, non-array, oversized or too-deep
*tree* returns `{ok: false}`. It also does the security work that must happen on the way in —
`isSafeHref` on button hrefs, `safeMediaSrc`, colour and length validation, inline-HTML
sanitisation.

At render, `safeProps()` parses one node's props and `BlockBoundary` catches whatever still
throws. That boundary should never fire now; it exists for pre-validator rows.

### Containers are addressed by string id

`"page"`, `"section-<blockId>"`, `"col-<columnsBlockId>-<n>"`. A move is
`removeFromContainer()` then `insertIntoContainer()` (`src/lib/tree-utils.ts`) — there is no
`moveBlock` helper on purpose, so dragging and the container picker are literally the same two
calls with no second path to drift. `src/lib/containers.ts` names the containers for the
inspector's picker, which exists because a floating block is not a sortable and cannot be
dragged between containers.

### Two route groups, two root layouts, no root layout

There is **no `src/app/layout.tsx`, and you must not add one.** `(builder)` and
`(published)/sites/[siteSlug]` each emit their own `<html>`, so a file at `src/app/` would
render above both of them, outside either document. Consequences:

- Error and 404 boundaries sit **beside each root layout**, not at the top.
  `src/app/global-error.tsx` is the only thing that can catch a throw *in* a root layout — the
  published one reads the database to pick `<html lang>` — so it supplies its own document and
  **inline styles**, because `globals.css` arrives through the layout that just failed.
- `globals.css` paints `html, body` in the builder's dark theme for **every** document. A
  published page opts out with `.public-canvas`; without it, a visitor's page renders black.
- Both published routes are `force-dynamic` and hit the database per request. There is no cache.

### The security posture

**The port is the boundary.** Single-tenant by design, no sign-in, binds loopback unless `HOST`
says otherwise (and then warns loudly). A reverse proxy is where access control goes. Content
authors are trusted; content is not. `SECURITY.md` states the threat model.

`src/proxy.ts` (Next 16 renamed `middleware` → `proxy`) runs three layers on every request: a
**Host allowlist** answering 421 to a name it does not serve (anti-DNS-rebinding, and it covers
GET because the export route reads out every site), an **Origin check** on the methods that
change something, and a **CSP with a per-request nonce**. A request with no `Origin` at all is
allowed — that is curl and your own scripts, and the loopback bind is the real defence.

The one exception is `POST /api/upload`. Next copies every body the proxy sees into memory and
cuts it off at 10 MB without telling the route, so the upload is left out of the matcher,
streams the file to disk itself, and calls `gate()` — the first two layers — before it reads a
byte. `src/proxy.test.ts` fails if any other route leaves the matcher or one that does skips the
gate. Every other route's body limit has to fit inside `PROXY_BODY_LIMIT`.

`src/lib/css-safety.ts` and `src/lib/url-safety.ts` are **dependency-free on purpose**: client
components import them, and pulling `security.ts` (postcss) into a client bundle breaks the
page. `src/lib/request-body.ts` caps a body before parsing it; no route under `src/app/api`
calls `req.json()` directly.

### Scripts that own something

- `scripts/first-run.js` — `.env`, schema push when the schema fingerprint moved, demo seed.
- `scripts/build-state.js` — whether `.next` was built from the source on disk, as a
  `(path, size, mtime)` walk. It never reads file bodies; `public/` is 56 MB.
- `scripts/e2e.js` — the throwaway database and the Playwright run (below).
- `scripts/audit-gate.js` — fails the build on a high-or-above advisory in a production
  dependency. Exceptions are by advisory id and carry a `holds()` that re-checks the mitigation,
  so an exception lapses in the commit that breaks it. The list is empty.
- `electron/server.js` — the desktop launcher: first-run, rebuild if the source moved, serve on
  loopback, open a browser, and signal the whole process group on the way out.
- `mcp-server.ts` — lets an agent build and publish sites, with no approval step. Its header is
  the prompt-injection warning; do not point an agent at it and untrusted material at once.

## Testing

Vitest is **node-only, `.ts` only** — no jsdom, no `.tsx`, so there are no component-render
tests. `scripts/**/*.test.ts` is included deliberately: an inverted condition in the audit gate
would disable it silently. Several tests assert on *source text* (that a route still calls
`normalizeBlockTree`, that a boundary never renders `error.message`); renaming a helper is meant
to fail them.

The browser suite must go through `npm run test:e2e`. The wrapper builds a throwaway database
and upload directory under `data/e2e/`, seeds them, runs against `next start` on port 3940, and
removes them. `e2e/global-setup.ts` refuses to run a single test until it has written a row and
read it back *through the server*, proving the server under test is not reading your real
database — the specs permanently delete every site they create, and port 3939 is the launcher's.
A second server on 3941 points at an empty database; it is the only way to exercise the error
boundaries, because every render path is otherwise guarded.

The wrapper also refuses to run against a `.next` older than the source, so build first.

## Comment style

This repository has a strong and unusual convention. Modules, exported functions and
non-obvious branches open with a block comment that **narrates the failure the code exists to
prevent** — in past tense, with specific numbers — and then states the rule that follows. Plain
British-English prose, full sentences, British spellings, no JSDoc tags, no bullet-point API
summaries, no TODOs. Comments explain *why this shape and not the obvious one*, including what
was tried and rejected. User-facing strings are written the same way.

Read `src/lib/block-tree.ts`, `scripts/audit-gate.js` and `src/lib/rails.ts` before writing any.
A terse `// parse the tree` is visibly out of place here.

## Things that will catch you out

- **`normalizeBlockTree` takes a list.** Wrap a single block: `normalizeBlockTree([block])`.
  `SavedBlock.content` holds one block; `Page.content` holds an array.
- **`insertIntoContainer` silently returns the tree unchanged for an unknown container id** —
  and `removeFromContainer` has already taken the block out, so committing that result *deletes
  it*. Re-check with `findBlock` before publishing a move.
- **Empty `children` arrays are dropped by the validator**, so "has children" is not a test for
  containerhood — that is what `CONTAINER_TYPES` is for. An empty section is exactly the
  container you most want to drop into.
- **A bad prop is repaired silently and a bad node is dropped silently.** A save can succeed
  while quietly losing a block; only the tree-level failures surface.
- **Block ids are regenerated** when missing or absurdly long, so they do not necessarily
  survive a round trip through the validator.
- **Lint is 0 errors and 0 warnings**, with `react-hooks/set-state-in-effect` as an error. The
  one relaxation, `react-hooks/refs` for the two dnd-kit files, is documented where it is set.

## Documents

`docs/SECURITY_REVIEW.md` is the audit, with every `NVX-` finding, how it was confirmed and
where it was fixed; findings are left as written because several explain why a defence is shaped
the way it is. `docs/LAUNCH_CHECKLIST.md` is the tickable pre-release list, cross-referenced to
those ids, and is a record of where the project stands rather than a wish list — each item
carries the file:line that proves its state, so correct them together with the code.
