# Neuravex — Website Builder

A self-contained website builder with a working CMS. Design sites visually, drag and drop blocks, edit text inline, and publish instantly. Runs entirely on your machine — no cloud, no signup, and nothing phoning home from the sites you build.

Works on **macOS**, **Linux**, and **Windows** (anything that can run Node 18+).

## Features

- **Visual editor** with live preview of your changes
- **Drag & drop** blocks from the palette onto the page, or reorder existing blocks
- **Inline text editing** — click any text on the page to edit it directly
- **13 block types** out of the box: Heading, Text, Image, Button, Video, Quote, List, Divider, Spacer, Section, Columns, Form, and Custom HTML
- **Container blocks** (Section, Columns) with their own drag-and-droppable child lists
- **Responsive columns** — published pages stack columns on phones and halve 3/4-column
  layouts on tablets, and each block stays in the column you put it in
- **28 starter templates** across landing, portfolio, business, blog, and minimal, filterable by category — 11 of them multi-page, with their pages already linked to each other
- **Multi-page sites** with home page routing. A new page starts from a layout you choose, drawn in the colours, section padding and column width read off the pages the site already has — not as a blank sheet
- **Links between your own pages** — pick a page from a list instead of typing its path, and renaming a page or the whole site moves every link that pointed at it
- **Per-block inspector** for fine-grained control of every property (colors, sizes, alignment, spacing, etc.)
- **Publish / unpublish** workflow — unpublished pages are drafts
- **Download the site as files** — plain HTML, CSS and images you can open or host anywhere
- **SQLite storage** in a single file, zero config
- **Autosave** with `Cmd/Ctrl+S` shortcut
- **Page history** — revisions with preview and restore; autosaves within five minutes of each other share one entry, and Cmd/Ctrl+S saves are kept separately
- **A picture library you can search** — uploads keep the name they arrived with, can be renamed and described in place, and are found by either; the 74 bundled photographs are searchable by what they show
- **Form submissions** stored in the CMS, viewable per page
- **Per-page and per-site SEO** — search title, description, and social image
- **German legal pages** — a guided flow collects what § 5 DDG and Art. 13 DSGVO ask for, writes an Impressum and a Datenschutzerklärung as editable pages, and links both in the footer of every page and subpage. The privacy notice describes what your site actually does: the builder reads your pages and only mentions third-party content it finds
- **No external services** — no accounts, no sign-in, and no analytics in your published sites

## Tech stack

| Layer        | Choice                                  |
| ------------ | --------------------------------------- |
| Framework    | [Next.js 14](https://nextjs.org) (App Router) |
| Language     | TypeScript                              |
| UI           | React 18 + Tailwind CSS                 |
| Drag & drop  | [@dnd-kit](https://dndkit.com)          |
| Database     | SQLite via [Prisma](https://prisma.io)  |
| Icons        | lucide-react                            |

## Quick start

You need **Node.js 18+** installed. From the project root:

```bash
npm install
npm run desktop
```

That is the whole of it. The launcher creates your `.env`, sets up the database, adds a
demo site on the very first run, builds the app and opens it in your browser. Running it
again does none of that work twice.

To work on Neuravex itself, use the dev server instead:

```bash
npm install
npm run setup      # .env, database, demo site — the same first-run steps
npm run dev
```

Open **http://localhost:3000** in your browser — you're straight into the builder, no account or sign-in step.

The seed creates a "Neuravex Demo" site at **http://localhost:3000/sites/demo** so you can see what a finished site looks like, and the same site is openable in the editor at **http://localhost:3000/**.

## Using the editor

1. From the home screen (`/`) click **+ New site** to start a project, or open an existing one.
2. Pick a starting template (or start blank).
3. Inside a site, click **+ New page** to add a page, or **Edit** on an existing one.
4. Inside the editor:
   - **Left rail** — the block palette. Drag a block onto the canvas, or click it to append.
   - **Canvas** — your page. Hover a block to reveal the drag handle, duplicate, and delete buttons on the left. Click any text to edit it inline.
   - **Right rail** — the inspector. Click a block to see and edit every property (colors, alignment, sizes, etc.).
   - **Top bar** — change the page title and URL slug, toggle **Preview** to see the public version, **Save** with `Cmd/Ctrl+S`, and **Publish** to make the page live.
5. To make a non-home page the site's home, click **Make home** in the top bar.

### URL scheme

- `/` — admin: list of all sites
- `/admin/sites/:siteId` — manage a site's pages
- `/admin/sites/:siteId/pages/:pageId` — edit a page
- `/sites/:siteSlug` — public home page
- `/sites/:siteSlug/:pageSlug` — public sub-page

## Project layout

```
prisma/
  schema.prisma         # SQLite schema (Site, Page)
  seed.ts               # Inserts a demo site
src/
  app/                  # Next.js App Router pages + API routes
    page.tsx            # Admin home (sites list)
    admin/sites/[id]/   # Site admin & page editor
    sites/[siteSlug]/   # Public site renderer
    api/                # JSON API
  components/
    blocks/             # Block components + dnd-kit wrappers
    editor/             # Editor: palette, inspector, page editor
    public/             # Read-only renderer for published pages
    ui/                 # Shared UI primitives
  lib/
    prisma.ts           # Prisma client singleton
    security.ts         # Sanitization + upload validation helpers
    sanitize.ts         # HTML sanitization (DOMPurify)
    blocks.ts           # Block type registry
    templates.ts        # Starter templates
    utils.ts            # cn(), slugify(), uid()
  types/index.ts        # Block prop types
```

## Data model

- **Site** — a website (`name`, `slug`, `accent`, theme).
- **Page** — a single page in a site (`title`, `slug`, `content` JSON, `published`, `isHome`).

A page's content is a tree of **Blocks** stored as JSON in `Page.content`. Each block has an `id`, `type`, `props`, and optional `children` (for section / columns). The flat list of pages per site is small; the JSON tree is the source of truth for the editor.

## Scripts

```bash
npm run dev        # Start the dev server
npm run build      # Production build
npm run start      # Run the production build
npm run db:push    # Apply schema to dev.db (creates tables)
npm run db:seed    # Insert the demo site (idempotent)
npm run db:reset   # Drop the database, recreate, and re-seed
npm run lint       # Lint
```

## Resetting the database

```bash
npm run db:reset
```

This replaces `prisma/dev.db` with a fresh copy holding the demo site. The new
database is built and seeded beside the old one and only put in its place once
it works, so a reset that cannot finish leaves your sites exactly as they were.
Quit Neuravex first if it is open — and restart it afterwards, since a running
copy keeps serving the database it started with.

## Adding a new block type

1. Add the block props interface in `src/types/index.ts`.
2. Register the block in `src/lib/blocks.ts` (label, icon, default props).
3. Create a component in `src/components/blocks/` that accepts `{ props, onChange, disabled }`.
4. Wire it into `src/components/blocks/BlockView.tsx`.
5. Add inspector controls in `src/components/editor/BlockInspector.tsx`.

That's it — the palette, drag-and-drop, save, and public render all pick it up automatically.

## Downloading a site

**Site → Download files** hands you the whole site as a `.zip` of ordinary
files. Unpack it and double-click `index.html` — it opens in a browser with no
server involved.

```
index.html          the home page
about.html          one file per published page
assets/site.css     only the styles these pages use, a few KB
uploads/  stock/    the images the pages point at
README.txt          what's inside, and how to host it
```

The pages are the same HTML a visitor gets, with the app's JavaScript removed
and every link and image pointed at the file beside it. Upload the folder to
any static host — Netlify, GitHub Pages, S3, a plain web server — and it works
as-is, with no build step.

Two things to know:

- Only **published** pages are exported. Drafts stay in the builder.
- **Forms** are included, but a static file has nowhere to send an answer.
  Keep using the builder if you want submissions stored, or point the form at
  a form-handling service.

## Telemetry

Neuravex itself makes no network calls and the sites you publish contain no
analytics. The Next.js CLI, however, collects anonymous usage telemetry by
default while you run the dev server or a build. That is Next.js, not
Neuravex, and you can turn it off once per machine:

```bash
npx next telemetry disable
```

The desktop launcher (`npm run desktop`) already starts the server with
telemetry disabled.

## Security

Neuravex has no sign-in and no access control — it's meant to run locally on your own machine, reachable only from that machine's browser. Don't expose it to the network without adding your own auth layer (e.g. a reverse proxy with basic auth).

- Requests that change something are refused when they come from another site. There is no sign-in to protect, but any page you have open elsewhere can post to `localhost` in the background, and it should not be able to delete your work. A request with no `Origin` at all — curl, a script of your own — is left alone
- User-provided HTML (custom headers, footers, rich text, HTML blocks) is sanitized with [sanitize-html](https://github.com/apostrophecms/sanitize-html), which parses the markup rather than matching text against it
- Uploaded SVGs are parsed and reduced to the elements that draw. `<script>`, `<style>`, `<foreignObject>`, `<use>` and the animation elements are dropped, along with every event handler and any URL that is not a page, a fragment or an inline picture
- Custom CSS is parsed rather than pattern-matched, and anything that reaches off the page — `@import`, a `url()` naming somewhere other than this document, `expression()`, `behavior` — is dropped. A stylesheet also cannot close the `<style>` element it is written into
- A Content-Security-Policy names each page's scripts by a nonce that changes every request, so a `<script>` arriving inside someone's content cannot run even if it gets past a sanitizer. The page can only talk back to this server, which is what stops anything it did find being sent elsewhere
- File uploads are restricted to a safe allowlist of extensions with a 10MB size limit
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set on all responses

## Known limitations (V1)

- No custom domains — sites served by the builder live under `/sites/:slug`. Use **Download files** to put a site on a host of your own.
- Page history keeps the newest 50 revisions per page; older ones are dropped.
- Drag and drop is fully supported within a single container (the page, a section, or a column) and across containers via drop, but the live "drag into another container" hover preview is a V2 item.
- Section padding is still a fixed pixel value at every screen size — only columns and the site nav respond to width so far.

