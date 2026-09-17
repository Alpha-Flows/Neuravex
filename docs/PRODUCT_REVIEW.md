# Neuravex — Product Review & Recommendations

A customer-standpoint review of the app as it stands. Written after running the app
locally (`npm run dev`), creating a site from the **SaaS Landing** template, editing it,
publishing it, and inspecting the result at desktop (1440px) and phone (390px) widths.
Every problem below was reproduced, not inferred.

---

## 0. Status update

**Scope note:** Neuravex is used on PCs only. The mobile-facing recommendations below
(responsive section padding, anything framed around phone visitors) are out of scope and
are kept only as a record of what was found. The responsive column work already merged
stays as it is — it only engages below 640px, so it costs a desktop user nothing.

### Round 1 — layout

- **P0-2 (not mobile-responsive)** — columns stack below 640px and halve on tablets, and
  the site nav collapses into a menu. Horizontal overflow on the SaaS template at 390px
  went from 55px to 0.
- **P0-3 (columns scramble content)** — each child records the column it belongs to, so
  adding or removing a block no longer reshuffles its siblings. Existing pages and
  templates keep their layout and convert to explicit placement on first edit.
- A bug this review missed: **no block inside a Section or Columns could be selected at
  all**. `SortableBlock` never forwarded its container handlers to `BlockView`, so
  clicking a nested block hit a no-op and the inspector never opened — and every template
  puts its content inside sections.

### Round 2 — bug fixes

- **Published forms did nothing.** The Form block read its read-only render flag as "do
  not accept input", so on every published page the fields and submit button were
  disabled. No submission could ever be recorded, which also made the submissions viewer
  (P2-10) a window onto rows that could not arrive. This was not in the review; it was
  found when a test could not type into a form.
- **P1-4 (revision history unusable)** — identical saves are skipped, autosaves inside a
  five-minute window collapse into one entry, manual saves are kept separately and
  marked, and each page keeps at most 50. 12 consecutive autosaves now produce 1
  revision instead of 12.
- **P1-7 (half-built settings)** — per-page SEO is reachable from a panel in the
  inspector rail and the save endpoint accepts it. `headHtml` was removed: the API
  accepted it and nothing ever rendered it.
- **P2-10 (form field keys)** — two fields sharing a label wrote to the same key and one
  answer was silently dropped; repeats are numbered now. A failed submission no longer
  shows the success message.
- **P2-12 (media library)** — the picker marks files that are in use and names the pages
  before deleting one.
- **The block toolbar was unreachable.** It hung 40px off each block's left edge, outside
  a canvas that fills the pane: clipped away entirely in a leftmost column, drawn over
  the neighbouring column everywhere else.
- Editor data hygiene: deleting a block stamped an empty `children` array onto every
  block on the page; duplicating a container gave the copy's children the same ids as the
  original, which breaks selection and drag-and-drop for both.
- A save that failed left the editor looking like it had succeeded.
- README corrected (13 block types, 28 templates) and the "no telemetry" claim made
  accurate — Neuravex makes no network calls, but the Next.js CLI collects anonymous
  telemetry by default.

### Round 3 — the editing bugs

Found by driving the editor the way a customer does, rather than by reading it. All six
were reproduced in a browser first and now have regression tests in `e2e/editing.spec.ts`.

- **Typing in a block and pressing Backspace deleted the whole block.** The guard against
  the delete shortcut checked for `INPUT` and `TEXTAREA`, but block text lives in a
  `contentEditable` whose tag is `H1` or `P`. One backspace mid-sentence in a heading
  wiped the heading. `Cmd+D` duplicated the block for the same reason.
- **Text you typed was never saved unless you clicked away first.** The editable element
  reported its contents on blur only, so the page was not marked dirty: autosave had
  nothing to save, `Cmd+S` wrote the *previous* version while the status line said "All
  saved", and closing the tab took the work with it — with no unsaved-changes warning.
  Keystrokes are reported as they happen now, and a run of them still collapses into one
  undo step.
- **The page address typed in the editor was silently discarded.** The save endpoint
  declared `slug` and never wrote it, so renaming a page's URL did nothing at all: the
  status said "Saved", the address reverted on reload, and "View live" pointed at a page
  that was not there. The server tidies and de-duplicates the slug, and the editor shows
  what it settled on.
- **Publish published the last autosave, not the page.** It flipped a flag on its own
  endpoint, so edits made in the seconds before the click went live only when autosave
  caught up — and unreported text never at all. Publishing now saves the page and sets
  the flag in one request.
- **Every text block rendered its own formatting toolbar.** Ten text blocks meant ten
  identical toolbars stacked on the same spot; a click landed on whichever was on top,
  which was rarely the one whose text was selected. Only the block being edited shows one
  now. The toolbar also stole focus on `mousedown`, which dropped the selection before
  `execCommand` could act on it, and `prompt()` did the same to the link button.
- **A fixed header covered the top of every page.** Chosen in site settings, `position:
  fixed` takes the header out of the flow and nothing made room for it.

Two smaller things went with them: undo/redo kept its stack in React state and read a
stale index when keystrokes outran a render, and three page listings each sorted
differently, so reordering pages did not show up consistently.

### Round 4 — prompt() editing and the remote images

- **P2-9 (prompt()-driven editing)** — the four `prompt()` calls are gone. A
  `prompt` cannot be styled, blocks the window, shows no context beyond one line, and
  takes the text selection with it, so a link typed into the one in the formatting
  toolbar was applied to nothing at all. In their place: a small panel anchored to the
  control that opened it (button link, image URL), an input in the toolbar itself for
  linking selected text, and a proper editor for custom HTML — a `prompt` cannot hold a
  newline, so any HTML worth embedding arrived as one unreadable line. Enter saves,
  Escape cancels, clicking away cancels, and the page behind stays visible.
- **P2-11 (remote images)** — nothing bundled points off the machine any more. All 29
  template images, used 67 times across the 28 templates, were Unsplash addresses: a new
  site made from a template showed broken pictures with no internet connection, in an app
  whose whole point is that it runs on your own machine, and a downloaded site carried
  that dependency with it. They now name bundled photos from `public/stock`, chosen per
  slot. A new image block starts on a bundled photo too, the empty-image placeholder is
  drawn in the page instead of fetched from `via.placeholder.com`, and a new video block
  starts empty rather than pointing at a demo clip on `w3schools.com` — it asks for a
  video in the editor and renders nothing on a published page. A unit test fails if any
  block default or template ever names a remote address again.

### Round 5 — the branding cascade

- **P1-6 (branding does not cascade)** — a site's accent reached the admin card and the
  header logo square and nothing else. Every button carried its own hex, so changing a
  brand colour meant opening every button on every page. A site's accent, fonts and
  corner radius are now emitted as CSS custom properties, and a block with no colour of
  its own reads them. Changing the accent in Settings recolours the whole site in one go,
  filled and outline buttons alike.
  - **New blocks ship unset** — a heading, text, button or divider added today inherits
    rather than pinning itself to a hex.
  - **Templates declare their brand colour.** All 28 carry an `accent`, a new site starts
    on it (a green restaurant no longer opens with indigo buttons), and 71 of the 75
    template buttons read the site accent instead of repeating a hex. The four that do
    not are deliberate — a light button on a dark hero — and keep their own.
  - **There is a way back.** Each colour field in the inspector offers "Use site accent"
    (or the page's text colour), so a block pinned to a hex can be handed back to the
    site's branding. Without it, picking a colour once was permanent.
  - **The editor canvas finally shows the site's branding**, scoped so it does not repaint
    the builder's own chrome — a step towards P1-5, since the canvas and the published
    page now agree on colour, font and radius.
- A bug found while doing it: **every template button was given `textColor: "#ffffff"`
  whatever its variant**, so the 9 outline and ghost buttons across the templates drew
  white text on a white page. A button now works out a readable label from its own
  colour, and an outline button draws its label in that colour rather than in white.
- The header settings help text told people to add a Spacer block under a fixed header.
  Round 3 made the page leave room for it, so the advice was stale.

### Round 6 — publishing basics

- **P1-8 (SEO and publishing basics)** — a published site now says what it is to anything
  that reads it.
  - **`sitemap.xml` and `robots.txt` per site.** Published pages only; a site with nothing
    published asks not to be indexed rather than offering an empty map. The download
    carries a `robots.txt` too — not a sitemap, whose entries have to be full addresses,
    and the address a downloaded folder ends up on is not known when it is built.
  - **Canonical addresses**, so a home page reached both as `/sites/x` and `/sites/x/index`
    is not counted as two pages with the same content.
  - **A favicon setting**, and **a language setting**: `<html lang>` was hardcoded to `en`
    for every site in every language, which is what a screen reader announces in and what
    a browser offers to translate from.
  - **Images load lazily** and decode off the main thread.
- Making the language settable meant splitting the app into two root layouts — `(builder)`
  and `(published)`. They were always two different documents: the builder's dark theme
  classes used to ride along on every published page, and the download had to strip them
  off again. A visitor's page now carries the site's styling and nothing else.
- Still open here: images carry no `width`/`height`, so a page can still shift while it
  loads. That needs the dimensions captured when a picture is chosen, which is its own
  piece of work.

### Still open from this review

P0-1 (no way to publish off the machine) is answered in part by **Download files** — a
site now leaves the machine as plain HTML, CSS and images — but there is still no
hosting step.
Also open: P1-5 (editor is not WYSIWYG — closer now that the canvas carries the site
theme), the last of P1-8 (no
images without dimensions — template images also carry no alt text), P2-13 (no reusable blocks), P2-15 (thin rails on destructive actions).

---

## 1. What the app is today

Neuravex is a **local-first visual website builder + CMS**. Next.js 14 + React + Tailwind
front end, SQLite via Prisma for storage, no accounts and no cloud.

| Area | What ships |
| --- | --- |
| Editor | 3-pane editor: block palette, canvas, inspector. Drag & drop inside and across containers, inline text editing, undo/redo (80 steps), autosave + `Cmd/Ctrl+S`, unsaved-changes guard, preview with 4 viewport widths |
| Blocks | 13 types — heading, text, image, button, divider, spacer, section, columns, video, quote, list, form, custom HTML |
| Templates | 28 starter templates across landing / portfolio / business / blog / minimal |
| Content | Multi-page sites, home-page routing, publish/unpublish per page, page duplicate & reorder |
| History | Revision snapshots with read-only preview and restore |
| Media | Upload library + 74 bundled stock photos in 10 categories (53 MB, fully offline) |
| Forms | Form block with submissions stored in the CMS and a per-page submissions viewer |
| Site settings | Accent, fonts, radius, header style (color / opacity / shape / placement), custom header & footer HTML, custom CSS, site-level SEO |
| Portability | Site export/import as JSON |
| Integrations | MCP server exposing 13 tools so an AI agent can build and publish sites |
| Packaging | Cross-platform desktop launcher script (`npm run desktop`) |
| Quality | 172 unit tests (sanitization, security, tree utils, revisions, zip, static export, forms, block defaults, site theme, SEO) — all passing; 54 Playwright specs |

---

## 2. What is genuinely good

**The first five minutes are excellent.** `npm run dev` and you are in the builder — no
signup, no workspace setup, no email verification. The demo site is seeded, templates are
one click, and the app opens straight onto "Your sites". Very few builders get you to a
real page this fast.

**The editor fundamentals are real, not a demo.** Drag and drop works within a container
and across containers, inline editing is direct-manipulation, and the things people
actually lose work to are covered: autosave, `Cmd+S`, undo/redo, a `beforeunload` guard,
`Esc` to deselect, `Cmd+D` to duplicate, `Delete` to remove. That is a mature set of
affordances for a v0.1.

**The templates look professional at desktop width.** The SaaS Landing page I generated
is genuinely shippable-looking — good type scale, good spacing, credible copy. 28 of them
is a real library, and the category filter plus live block-tree previews in the picker
make choosing one pleasant.

**Local-first is honoured where it counts.** One SQLite file, no network dependency for
the app itself, a bundled stock photo library instead of an API key, and a desktop
launcher. Users who care about owning their data get exactly that.

**Security is taken seriously for a local tool.** Parser-based HTML sanitization
(`sanitize-html`, not regex), a CSS sanitizer that strips `url()` / `@import` /
`expression()`, SVG sanitization on upload, an extension allowlist with a 10 MB cap, and
security headers on every response — all covered by unit tests.

**The MCP server is the most differentiated thing in the repo.** Thirteen tools that let
an agent list templates, create sites and pages, write block trees and publish. No
mainstream website builder ships that.

---

## 3. What is bad — ranked by customer impact

### P0-1. You cannot actually get your website online

"Publish" flips a boolean and makes the page visible **on your own machine** at
`localhost:3000/sites/<slug>`. There is no static export, no HTML download, no deploy
target, and no custom domain. Export produces Neuravex-flavoured JSON that only Neuravex
can read (`src/app/api/sites/[id]/export/route.ts`).

For the customer this is the whole ballgame: the product currently builds *mockups*, not
*websites*. Everything else in this review is secondary to it.

### P0-2. Published sites are not mobile-responsive

`Columns` renders `gridTemplateColumns: repeat(N, minmax(0,1fr))` as an inline style with
no breakpoint (`src/components/blocks/Columns.tsx`). A 3-column feature grid on a 390px
phone becomes three unreadable slivers with headings overlapping, and the page scrolls
horizontally (measured `scrollWidth` 445px vs `clientWidth` 390px on the SaaS template).
The site nav is a flat flex row with no hamburger, so it overflows too.

Headings and text *do* scale (`text-5xl md:text-6xl`), which makes this worse, not better:
the parts that break are exactly the parts a customer builds their landing page out of.
Most real traffic is mobile — a site that ships like this is a liability.

### P0-3. Columns scramble your content when you add or remove a block

Column children are stored as one flat array and split by `ceil(n / cols)`
(`distributeLeftToRight`, `src/lib/tree-utils.ts`). Measured behaviour:

| Blocks | Columns | Result |
| --- | --- | --- |
| 4 | 3 | **2 / 2 / 0** — third column empty |
| 5 | 4 | **2 / 2 / 1 / 0** — fourth column empty |
| 2 | 3 | 1 / 1 / 0 |

So adding a fourth feature card to a three-column grid silently re-shuffles the first
three cards and leaves column three empty. There is also no way to *say* "put this block
in column 3" — only dragging, and the drop target may not exist.

### P1-4. Revision history is unusable, and it grows without limit

Every save writes a full page-JSON snapshot (`/api/pages/[id]/save`), and autosave fires
1.5s after any change. I confirmed 5 saves → 5 revisions, with no dedup, no cap, and no
labels. A 20-minute editing session produces hundreds of entries, all titled the same,
timestamps seconds apart, each a complete copy of the page. The panel shows the latest 50,
so "yesterday's version" — the only one anyone wants — is pushed out first.

Deleting a page also cascade-deletes its revisions, and there is no trash. One misclick is
permanent.

### P1-5. The editor is not WYSIWYG

The canvas renders the block tree only. It does **not** render the site header, the footer,
or custom CSS — all of which appear on the published page. It *does* render editor-only
chrome inline ("Upload image", "Use URL", the `# ↗` link button), which shifts layout.

The gap is worst for the "fixed" header placement, where the settings copy itself tells
the user to add a Spacer block by hand to compensate for content hiding behind the header.
That is the product asking the customer to do layout maths it should be doing.

### P1-6. Site-wide branding does not cascade

`accent` colours the admin card and the header logo square — nothing else. Every button
stores its own hex (`color`, `textColor`), every heading its own colour. Changing a brand
colour means opening every button on every page. There is no type scale, no shared button
style, no design tokens.

### P1-7. Half-built features that look finished

| Field | Status |
| --- | --- |
| `Site.theme` (light/dark) | Stored, editable via API, **never read by any renderer** |
| `Site.headHtml` | Writable via `PATCH /api/sites/[id]`, **never rendered**, no UI — so the documented "load Google Fonts / add analytics" path does not exist |
| `Page.scheduledAt` | In the schema, **no scheduling logic anywhere** |
| `Page.metaTitle` / `metaDescription` / `ogImage` | **Read** by `generateMetadata`, but no UI and `PATCH /api/pages/[id]` refuses to set them — per-page SEO is impossible from inside the app |

### P1-8. SEO and publishing basics are missing

No `sitemap.xml`, no `robots.txt`, no favicon setting, no canonical URLs, and
`<html lang="en">` is hardcoded for every site in every language. Images render as raw
`<img>` with no `width`/`height` (guaranteed layout shift) and no `loading="lazy"`, and
uploads are stored and served at original size — a 10 MB PNG stays a 10 MB PNG.

### P2-9. The most important edits happen in `window.prompt()`

Button link URL, image URL, custom HTML, and inserting a text link all open a browser
prompt. Editing an HTML embed in a single-line prompt box is painful. There is also no
internal link picker: linking to your own Contact page means typing the path from memory,
and nothing rewrites links when a slug changes.

### P2-10. Forms are a lead-capture dead end

- The field `name` is the **visible label**, so renaming a label changes the data key, and
  two fields with the same label collide.
- No email notification, no webhook, no CSV export — leads sit in SQLite until someone
  remembers to look.
- No honeypot, no rate limit, no cap. `POST /api/submissions` accepts any `pageId` from
  anyone, so a published site has an unbounded, unauthenticated write endpoint.
- Required fields are enforced only in the browser.
- The viewer is one page at a time, with no "all submissions" inbox and no unread count.

### P2-11. "Fully offline" is not true in practice

Templates contain **67 remote image URLs** (Unsplash and friends). With no network, the
hero images fail — I reproduced this: `ERR_TUNNEL_CONNECTION_FAILED` on the SaaS template.
Meanwhile 53 MB of perfectly good bundled stock photos sit in `public/stock`, unused by
any template. The default Image block also points at Unsplash.

Separately, 27 of the 28 templates are single-page, so the multi-page story is barely
exercised, and "+ New page" gives you a blank page with none of the template's styling.

### P2-12. The media library is write-mostly

No search, no rename, no stored alt text, and no "where is this used". Deleting an image
silently breaks every page that references it — with no warning and no way to find them.

### P2-13. No reuse anywhere

You cannot save a section as a reusable component, cannot copy-paste blocks between pages,
and there is no layer/outline tree — so once a Section is full of children, selecting the
Section itself is fiddly.

### P2-14. The docs have drifted, which costs trust

README says **11 block types** (there are 13), **5 starter templates** (there are 28), and
that the revisions UI "is not built" (it is). It also claims **no telemetry** — but Next.js
telemetry is on by default and nothing disables it; `npx next telemetry status` reports
"Thank you for participating!" on a fresh install. For a product whose pitch is privacy,
that specific claim being wrong matters more than the others.

### P2-15. Destructive actions have thin rails

"Delete site" sits inside the settings modal next to Save, behind a browser `confirm()`.
There is no trash and no undo for a deleted page or site — and deleting a site takes its
pages, revisions and submissions with it. The API is entirely unauthenticated (fine on
localhost, by design), but nothing in the UI warns when the server is reachable from the
LAN.

---

## 4. Recommendations

### Tier 1 — ship-blockers

**R1. Make "Publish" mean published.**
Add a static export that writes real HTML/CSS/assets (download as a zip), plus at least one
push-button deploy target (Netlify drop, GitHub Pages, Vercel, or plain SFTP). Let a site
be served at the root path instead of `/sites/<slug>`, and allow a configured base URL so
canonical tags and sitemaps are correct. Without this, nothing else in the product matters.

**R2. Responsive by default.**
- Stack `Columns` below 640px and drop 3/4-column grids to 2-up below 1024px, as the
  baseline behaviour — not an opt-in.
- Add per-breakpoint overrides in the inspector (columns, padding, visibility) for people
  who want control.
- Give the site header a hamburger menu below `md`.
- Replace raw px Section padding with a responsive scale (S/M/L/XL) that shrinks on mobile.
- Wire the existing viewport toggle into *editing*, not just preview, so users design the
  mobile view directly.

**R3. Fix column ownership.**
Store children per column slot instead of deriving membership from array index maths. Add
explicit "move to column ←/→" controls on each child. This removes the "my layout
scrambled itself" class of bug entirely.

### Tier 2 — high value

**R4. Version history people can use.** Snapshot on publish, on manual "Save version", and
at most once every N minutes for autosaves. Let users name a version, show what changed
("3 blocks edited"), prune to a retention window, and add a 30-day trash for deleted pages
and sites.

**R5. True-to-life canvas.** Render the site header, footer and custom CSS inside the
editor; move editor-only affordances into hover overlays and the inspector so nothing in
the flow is editor-only. This also makes the "fixed header" Spacer workaround unnecessary.

**R6. A design system panel.** Site-level tokens — colour palette, type scale, radius,
default button and link styles — that blocks inherit, with per-block override. Rebranding
becomes one screen, and templates instantly adopt the customer's brand on creation.

**R7. Finish or remove the half-built features.** Implement `headHtml` injection with a UI
(this is how people add analytics and web fonts), add a per-page SEO panel (title,
description, OG image, slug, noindex) and make `PATCH /api/pages/[id]` accept those fields,
implement the light/dark public theme or drop the column, and either build scheduled
publishing or drop `scheduledAt`. Add `sitemap.xml`, `robots.txt`, a favicon setting, and a
per-site `lang`.

**R8. Forms that actually capture leads.** Stable field keys independent of labels, email
and/or webhook notification on submit, CSV export, honeypot + rate limit + per-page cap,
server-side required validation, and a single "Submissions" inbox across the site with
unread counts.

### Tier 3 — differentiation

**R9. Lean into the AI angle you already have.** The MCP server is the unique asset. Surface
it in-app: "describe your site" → generated pages, per-block "rewrite this copy", "generate
a pricing section". Local-first + AI-native is a position no mainstream builder occupies;
local-first alone is not.

**R10. Reusable sections and global blocks.** Save a section as a component, reuse it across
pages, edit once. Add copy/paste of blocks between pages and a layer/outline tree for
selection.

**R11. Internal link picker.** Pick a page from a dropdown instead of typing a path, and
rewrite links automatically when a slug changes.

**R12. Real asset pipeline.** Resize and compress on upload, emit `width`/`height` and
`srcset`, convert to WebP, lazy-load by default. Repoint every template at the bundled
`/stock` library so "works offline" is true out of the box.

**R13. Collections / blog.** A repeatable content type with list and detail rendering. The
Journal template promises a blog; there is no collection behind it, so every post is a
hand-built page.

**R14. Pre-publish confidence check.** A checklist before publish: missing alt text, empty
or broken links, missing meta description, mobile overflow, oversized images. Cheap to
build, and it directly counters the quality problems above.

### Quick wins (under a day each)

- Set `NEXT_TELEMETRY_DISABLED=1` in the npm scripts so the README's privacy claim is true.
- Correct the README: 13 block types, 28 templates, revisions UI exists.
- Repoint template images at `/stock` assets.
- Move "Delete site" out of the settings save row; require typing the site name to confirm.
- Replace the four `prompt()` dialogs with inline inspector fields.
- Add `width`, `height` and `loading="lazy"` to rendered images.
- Add an "All submissions" table with CSV download.
- Warn in the UI when the server is bound beyond localhost.

---

## 5. If I could only fix three things

1. **Static export + one-click deploy** — turns a mockup tool into a website builder.
2. **Responsive columns and nav** — without it, everything published is broken on phones.
3. **Per-column child storage** — stops the editor from rearranging the user's work.
