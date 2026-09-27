# Contributing to Neuravex

Thank you for wanting to help. Bug reports, fixes, documentation and new
blocks are all welcome. This page says how to get a working copy, what has to
pass before a change can be merged, and the few conventions this codebase is
strict about.

## Before you start

- **A bug?** Search the [issues](https://github.com/Alpha-Flows/Neuravex/issues)
  first, then open one with the bug template. The version (bottom of the
  dashboard, or `package.json`), your operating system, your Node version and
  how you started Neuravex answer most of the first round of questions.
- **A security problem?** Please do not open a public issue. [`SECURITY.md`](SECURITY.md)
  says how to report it privately.
- **A new feature?** Open an issue describing it before writing much code, so
  we can agree it fits. Neuravex is deliberately a local, single-user program
  with no accounts and no hosting; proposals that change that are unlikely to
  be taken.

## Getting a working copy

You need Node.js 22.12 or newer and Git.

```bash
git clone https://github.com/Alpha-Flows/Neuravex.git
cd Neuravex
npm install
npm run setup      # .env, the database and the demo site
npm run dev        # http://localhost:3000
```

The database lives in `prisma/dev.db` and uploads in `data/uploads/`; both are
ignored by Git. `npm run db:reset` gives you a fresh database with the demo
site.

[`CLAUDE.md`](CLAUDE.md) is the architecture guide — how a page is stored, why
there is no root layout, where the security checks live and what will catch
you out. It is written for AI coding assistants and people alike; read it
before changing anything under `src/lib/` or `src/app/api/`.

## What has to pass

CI runs all of this on every pull request, and you can run the same thing
locally in the same order:

```bash
npm run check            # everything below, stopping at the first failure
npm run check -- --quick # lint, types, unit tests and the advisory gate only
```

Or one step at a time:

```bash
npm run lint                                   # 0 errors and 0 warnings
node scripts/run-local.js typescript --noEmit  # type check
npm test                                       # unit tests (Vitest)
npm run build && npm run test:e2e              # browser tests (Playwright)
npm run smoke                                  # the launcher, started from nothing
```

One unit file or one case:

```bash
npm test -- src/lib/block-tree.test.ts
npm test -- src/lib/block-tree.test.ts -t "drops a node"
```

The browser suite builds its own throwaway database under `data/e2e/` and runs
against a production server on port 3940, so it never touches your sites. It
refuses to run against a build older than the source, so build first.

## Conventions this codebase is strict about

- **Never `npx`.** Run tools through `node scripts/run-local.js <tool>`, and
  never put a bare binary name in a package script. `npx` with no terminal
  attached quietly fetches whatever the registry calls latest; for Prisma that
  once meant a `db push` from two major versions ahead against the only copy
  of somebody's sites. The same goes for anything you write into the docs.
- **Every write to a page's block tree goes through `normalizeBlockTree`**
  (`src/lib/block-tree.ts`). It repairs what it can and refuses only what it
  cannot, and it is where links, pictures and inline HTML are made safe.
- **Lint means zero warnings,** not just zero errors.
- **No `src/app/layout.tsx`.** The builder and the published sites each have
  their own root layout; a file there would render above both.
- **Comments explain why.** Modules and non-obvious branches open with a short
  account of the failure the code exists to prevent, then the rule that
  follows from it — plain prose in British English, no JSDoc tags. Read the
  top of `src/lib/block-tree.ts` for the tone. User-facing text is written
  the same way: say what happened and what to do, in words.
- **Tests come with the change.** Unit tests are Node-only `.ts` files next to
  the code; anything a person clicks belongs in `e2e/`. Some tests assert on
  source text on purpose, so renaming a helper may fail one — update it
  rather than deleting it.

## Adding a block type

1. Add the type to `BlockType` and its props interface in `src/types/index.ts`.
2. Describe its props in `PROPS` in `src/lib/block-tree.ts`. Every save,
   import, paste and MCP write goes through this, and so do both read paths,
   so it is where a link is checked with `isSafeHref`, a picture with
   `safeMediaSrc` and text with `inlineText`. A type with no entry here is
   dropped from every page it is saved on.
3. Register it in `src/lib/blocks.ts` (label, icon, default props — bundled
   files only; `blocks.test.ts` fails on a default that points off the
   machine).
4. Create a component in `src/components/blocks/` that accepts
   `{ props, onChange, disabled }` (and `blockId`, if it draws ids or anchors —
   make them with `domId`).
5. Wire it into `src/components/blocks/BlockView.tsx`.
6. Add its panel: a small one as a case in
   `src/components/editor/BlockInspector.tsx`, a larger one as a file in
   `src/components/editor/inspectors/` built from the shared controls in
   `inspector-fields.tsx`.
7. If it loads anything or links anywhere, teach `src/lib/legal/audit.ts` to
   see it, and `src/lib/page-links.ts` to move its links when a page is
   renamed.

A published or downloaded page runs no script of the block's own, so anything
a visitor can open, close or step through has to be plain HTML and CSS.

## Pull requests

- Keep a pull request to one change, with tests, and describe what a user
  would notice.
- Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) for
  anything a user would notice.
- If you change something `docs/LAUNCH_CHECKLIST.md` cites by `file:line`,
  correct the citation in the same pull request.
- A maintainer reviews every pull request; CI has to be green before merge.

## Licence

Neuravex is licensed under the [Apache License 2.0](LICENSE). By submitting a
contribution you agree that it is licensed under the same terms, as section 5
of the licence describes. Only contribute work you have the right to license
this way — and for pictures, fonts and other media, only files whose licence
allows redistribution (see `public/stock/README.md` and `public/fonts/README.md`).
