# Neuravex — Website Builder

A self-contained website builder with a working CMS. Design sites visually, drag and drop blocks, edit text inline, and publish instantly. Runs entirely on your machine — no cloud, no signup, no telemetry.

Works on **macOS**, **Linux**, and **Windows** (anything that can run Node 18+).

## Features

- **Visual editor** with live preview of your changes
- **Drag & drop** blocks from the palette onto the page, or reorder existing blocks
- **Inline text editing** — click any text on the page to edit it directly
- **11 block types** out of the box: Heading, Text, Image, Button, Video, Quote, List, Divider, Spacer, Section, and Columns
- **Container blocks** (Section, Columns) with their own drag-and-droppable child lists
- **5 starter templates** (SaaS landing, Personal portfolio, Restaurant, Journal, Blank) that you can use as-is or remix
- **Multi-page sites** with home page routing
- **Per-block inspector** for fine-grained control of every property (colors, sizes, alignment, spacing, etc.)
- **Publish / unpublish** workflow — unpublished pages are drafts
- **SQLite storage** in a single file, zero config
- **Autosave** with `Cmd/Ctrl+S` shortcut
- **No external services** — no network calls, no accounts, no analytics

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
# 1. Install dependencies (postinstall also runs `prisma generate`)
npm install

# 2. Set up your environment
cp .env.example .env
# Edit .env and set a strong AUTH_PASSWORD

# 3. Create the database and apply the schema
npm run db:push

# 4. (Optional) Seed a demo site so the app is not empty
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open **http://localhost:3000** in your browser. You'll be prompted to log in with the password you set in `.env`.

The seed creates a "Neuravex Demo" site at **http://localhost:3000/sites/demo** so you can see what a finished site looks like, and the same site is openable in the editor at **http://localhost:3000/**.

## Authentication

Neuravex uses password-based authentication to protect the admin panel and API:

- Set `AUTH_PASSWORD` in your `.env` file (required — the app won't start without it)
- Optionally set `SESSION_SECRET` to a random 32+ char string for production (e.g. `openssl rand -hex 32`)
- Sessions use HMAC-SHA256 signed cookies
- Login is rate-limited to 10 attempts per IP per 15 minutes

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
    security.ts         # Auth, session tokens, sanitization
    sanitize.ts         # HTML sanitization (DOMPurify)
    blocks.ts           # Block type registry
    templates.ts        # Starter templates
    utils.ts            # cn(), slugify(), uid()
  types/index.ts        # Block prop types
```

## Data model

Two tables:

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

This deletes `prisma/dev.db` and re-seeds the demo site.

## Adding a new block type

1. Add the block props interface in `src/types/index.ts`.
2. Register the block in `src/lib/blocks.ts` (label, icon, default props).
3. Create a component in `src/components/blocks/` that accepts `{ props, onChange, disabled }`.
4. Wire it into `src/components/blocks/BlockView.tsx`.
5. Add inspector controls in `src/components/editor/BlockInspector.tsx`.

That's it — the palette, drag-and-drop, save, and public render all pick it up automatically.

## Security

- All admin routes and API endpoints are protected by HMAC-signed session cookies
- User-provided HTML (custom headers, footers, rich text, HTML blocks) is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify)
- Custom CSS is sanitized to strip `url()`, `@import`, `expression()`, and other exfiltration vectors
- File uploads are restricted to a safe allowlist of extensions with a 10MB size limit
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set on all responses
- Open redirects are prevented on the login flow

## Known limitations (V1)

- No multi-user support — the app uses a single shared password.
- No custom domains — published sites live under `/sites/:slug`.
- No versioning / page history (revisions table exists but UI is not built).
- Drag and drop is fully supported within a single container (the page, a section, or a column) and across containers via drop, but the live "drag into another container" hover preview is a V2 item.

