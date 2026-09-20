# Neuravex — Product Review & Recommendations

A customer-standpoint review of the app as it stands. Written after running the app
locally (`npm run dev`), creating a site from the **SaaS Landing** template, editing it,
publishing it, and inspecting the result at desktop (1440px) and phone (390px) widths.
Every problem below was reproduced, not inferred.

---

## 0. Status update

**Scope note — how this product is delivered:** Neuravex is software people download and
run on their own machine. It is not a hosted service, and there is no plan to host either
the builder or the sites built with it. So "get the site online" is answered by **Download
files** — the site leaves as plain HTML, CSS and images that work on any host the customer
already has — and not by a deploy button or a hosting product. Recommendations below that
assume a hosted product (R1's deploy targets, serving at a root path, custom domains) are
out of scope and are kept only as a record of what the first pass found.

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

### Round 7 — deleting, with a way back

- **P2-15 (destructive actions have thin rails)** — deleting was final. A browser
  `confirm()` said "this cannot be undone" and nothing else, then took the site's pages,
  their history and every form submission with it.
  - **A trash.** Deleting a site or a page writes it away whole first — settings, pages,
    revisions and the answers people sent through forms — and "Put back" rebuilds it. The
    50 most recent deletions are kept; the trash sits under the sites list.
  - **The confirmation says what goes.** It counts the pages, saved versions and form
    submissions attached, warns separately about submissions (nobody else has a copy of
    those), and offers a JSON copy before deleting a site.
  - **A caller that means it** can still delete outright with `?permanent=1`.
  - **The builder says when it is reachable over the network.** The API asks nobody who
    they are — reasonable on your own machine, which is the design — but nothing said so
    when the address in the bar was not localhost, and anyone on the same Wi-Fi could edit
    or delete these sites.
- A bug found on the way: **the JSON export had fallen behind the schema.** It listed
  fields by hand, so header styling, per-page SEO and the site's own social image were
  dropped — "export and re-import" quietly gave back a different site. Export, import and
  the trash now share one archive format, and a test reads `schema.prisma` and fails when
  a field is added to the schema and not to the archive.

### Round 8 — the canvas shows what ships

- **P1-5 (the editor is not WYSIWYG)** — the canvas rendered the block tree and nothing
  else, so you laid a page out against a blank top edge and found out what it sat under
  after publishing.
  - **The site header, its nav and the footer are drawn in the canvas**, by the same
    components the published page uses — extracted so there is one implementation rather
    than two to drift apart.
  - **The site's custom CSS applies in the canvas**, scoped to it so a rule on `body`
    styles the page being edited and not the builder around it. A guard after it keeps a
    broad rule from hiding the controls you need to edit with.
  - **A fixed header is held inside the canvas.** Fixed means fixed to the window, so it
    covered the builder's own toolbar and spanned the whole app.
  - **The editor's own controls left the layout.** "Upload image", "Use URL" and the link
    under a button each took a line of their own and pushed everything below them down.
    They float over their block now, and appear when it is hovered or selected.
  - **Blocks are no longer spaced differently from the published page.** The canvas put
    12px between every block; a published page stacks them flush. Nothing in the review
    named this one — it turned up measuring the gap above a heading in both places.
- `headerOffset` moved out of the header's module on the way: the component is a client
  one, and a plain function exported across that boundary is not callable from the server
  page that renders it. The published page threw until it moved.

### Round 9 — the MCP server had been left behind

Not from the review: found by checking the agent-facing side against what the last rounds
changed to the app.

- **An agent could destroy a site outright.** `delete_site` and `delete_page` called
  Prisma directly, so a site deleted through MCP was gone with its pages, history and form
  submissions — while a person deleting the same site could put it back. Both paths go
  through the trash now, and the tools say so in their replies.
- **`create_site` ignored the template's brand colour**, so an agent making a restaurant
  site got indigo buttons where the builder gives the template's yellow. The rule lives in
  one place now and both callers use it.
- **It ran its own bare Prisma client.** WAL and the busy timeout are set by the app's
  connection — which exists, as the comment there says, so the MCP server and the web app
  can share one SQLite file. The MCP server was the one process not using it, so it was
  the side that would throw `SQLITE_BUSY` under contention.

Tests read `mcp-server.ts` and fail if it deletes directly, stops using the shared accent
rule, or opens its own database connection again.

### Round 10 — a download that starts

Not from the review either: it follows from what this product is. Neuravex is downloaded
and run on the customer's own machine, so the first thing that happens after unpacking has
to work — and it did not.

- **A fresh copy could not start.** Neither `.env` nor the database file is in a download:
  both are made locally. `npm install && npm run desktop` started a server whose every
  page threw, and the two commands that fixed it were steps 2 and 3 of the README. The
  launcher now writes `.env`, creates the database, applies the schema and seeds the demo
  site on a first run, before it serves anything. Proved on a copy built from
  `git archive` with no `.env` and no database: the builder and the demo site both answer.
- **An update applies itself.** The launcher notices when the schema has moved and applies
  it on the way up, which is the footgun behind two "needs `npm run db:push` after
  pulling" notes in this repository's recent history. It never passes
  `--accept-data-loss`: `prisma db push` refuses rather than dropping a column, and on a
  machine holding someone's only copy that is the right answer.
- **A normal start costs nothing.** The schema it last applied is remembered, so the
  second launch does no work — 45ms, measured.
- `npm run setup` does the same steps for anyone using the dev server, and the README's
  quick start is now the two commands the launcher actually supports.

### Round 11 — the rest of P1-7

Round 2 closed two of this finding's four rows and left two, which is the finding's own
complaint applied to itself.

- **Dark mode is gone.** `Site.theme` was stored, settable through the API and carried in
  the export, and **no renderer ever read it**: a site set to dark rendered light. Removed
  rather than built, which is the owner's call — Neuravex has one look for published
  sites.
- **`Page.scheduledAt` is gone too.** Scheduled publishing was never written; the column
  sat in the schema, and the new archive format had started carrying it with a comment
  admitting it was unused. Removed on the same grounds *(my call, not asked for — say the
  word and it comes back with scheduling attached)*.
- **Removing a column had to be shippable.** `prisma db push` refuses to lose data, which
  is right on a machine holding someone's only copy and was exactly what the launcher
  relied on — so a dead column could never be taken out. Intentional removals are now
  written down in `prisma/intentional-drops.json` with what they held and why, and the
  launcher accepts a loss only when **every** warning names a column on that list.
  Anything else still stops, untouched.
- A bug from the round before, found here: the launcher pushed with `--skip-generate`, so
  after a schema change the generated client still expected the old columns and the app
  queried what the database no longer had. It regenerates now.

Checked by updating a copy that still had the column and a seeded site in it: the column
goes, the message says what happened, and the site and its pages come through.

### Round 12 — the last of P1-8

- **Images reserve their space.** An `<img>` with no width and height leaves the browser
  nothing to hold, so a page jumped as each picture arrived — the heading you were reading
  slid away under you. Measured: with a picture held back, the heading beneath it moved
  **1152px** when it landed. It now moves 0.
  - The size is read from the file itself — a small header reader for PNG, JPEG, GIF and
    WebP rather than an image library for four numbers — when a picture is uploaded, and
    measured in the browser when one is chosen from the library.
  - All 29 template images carry their real size, checked against the files on disk.
  - A picture with no known size still renders as before; nothing regressed for existing
    pages.
- **Template images say what they show.** Every one shipped with `alt=""`, so a screen
  reader got 67 silent images across the 28 templates. Each of the 29 now has a
  description written against the photograph.

Tests fail if a template image loses its alt text, loses its size, or states a size that
does not match the file.

### Round 13 — reuse

- **P2-13 (no reuse anywhere)** — a section built on one page had to be rebuilt by hand on
  the next.
  - **Copy, cut and paste**, including between pages and tabs: the block is kept in the
    browser's own storage, so it outlives the editor being remounted. Every paste gets
    fresh ids, so pasting twice — or pasting back into the page it came from — cannot
    produce two blocks claiming one id. The palette offers a "Paste section" button when
    something is on the clipboard, and the shortcuts stand aside while a caret is in text,
    where the browser's own copy and paste is what was meant.
  - **An outline of the page**, next to the palette. Once a Section is full of children,
    clicking the Section itself is fiddly — every click lands on something inside it. Each
    block is one row, indented, labelled with a few words of its own content and, inside a
    Columns block, which column it sits in.
  - **Saved blocks.** Name a block from the inspector and it is offered in the palette on
    every page of every site, inserted with fresh ids.

### Round 14 — wide windows

Reported from real use, not from the review: on a large monitor the page came apart, and
text set to "left" turned up in the middle or on the right.

One cause behind both: **there was no page content column.** The header and footer each
sat in their own 1152px box, a section positioned its contents inside the *window*, and a
block placed straight on the page had no constraint at all. Measured at 2560px, four
left-aligned paragraphs started at **0, 24, 704 and 1384** — one of them jammed against
the edge of the screen, another most of the way across it.

- **One column, used by everything.** Header, footer, blocks on the page and every section
  that follows the site all sit in it. The same four paragraphs now start at 704, to the
  pixel.
- **A section's position is relative to that column**, not the window, so a section set to
  "left" lines up with the header instead of hugging the screen edge. A section asked for
  edge to edge still spans the window.
- **The width is a setting** — Narrow, Standard, Wide, Extra wide, Full — because the real
  complaint about a big monitor is that 1152px is a strip down the middle of it. The 55
  template sections that used the old page width now follow the site, so changing it
  widens the whole site at once.
- **The two "Align" controls are no longer both called Align.** A section's is "Content
  position", with a line saying it moves the contents within the page column and that text
  alignment lives on the text. That pair is how a paragraph set to "left" ended up on the
  right with nothing explaining it.

### Round 15 — the editor's own canvas

Verifying round 14 across four window widths turned up the same fault one level up: the
editor canvas stopped at 1024px whatever the window. On a large screen you laid the page
out at a width no visitor would ever see, and most of the monitor sat empty. It takes the
room it is given now; the viewport buttons in preview still pin it to a size on purpose.

### Round 16 — the canvas and the preview, one page

Pressing Preview re-laid the whole page out: the inspector's 18rem went away, the canvas
grew from 1054px to 1342px, and every line re-wrapped. You were editing one layout and
checking another.

- **The width buttons moved into the toolbar** and apply while editing, so a page can be
  checked at a phone or tablet width without switching modes.
- **The side rails stay mounted in preview**, and either one folds away from the toolbar
  when the page needs the room. With both folded, the canvas column and the published
  column measure the same, and a paragraph breaks in the same place in both.
- **The editor's own controls came out of the page's flow**, so the canvas is no longer
  taller than the page it is showing.

### Round 17 — a header that behaves like a header

A sticky or fixed header held its place on the published page and slid away in the canvas:
scrolled 186px, the published page kept it at top 16 while the canvas had it at -81.

The pane did the scrolling and the frame was clipped, which made the frame a scroll
container that never scrolled — and `position: sticky` resolves against the nearest one.
The frame scrolls itself now, so it is the scrollport a header can hold its place in.
Measured at 1280px past 1700px of scroll, canvas and published page agree for every
placement and shape.

A pill also stopped being a pill the moment the page moved: it floats on a 1rem margin at
rest and snapped flush to the top when stuck. It now comes to rest at the same 1rem, so it
is the same shape at every scroll position.

### Round 18 — three things the editor did behind your back

Found by driving the real editor and comparing it against the published page. The geometry
already matched block for block, so these are the other kind of divergence: what the editor
*does* rather than what it draws.

- **A keystroke changed the page while it was being previewed.** Five blocks before
  previewing, four after a Delete nobody could see. Only saving still works there.
- **A link on the canvas walked out of the builder** — the site's nav is drawn for real, so
  clicking the header left the editor for the published site. The click selects the block
  underneath now; "View live" is the way out.
- **Picking a block in the outline selected something off screen.** A selected block is
  brought into view, and one already on screen is left exactly where it is.

### Round 19 — two holes, and two sanitisers that matched text

Both sanitisers ran regular expressions over text an attacker chooses the shape of.

- **SVG uploads.** `<svg onload=alert(1)>` (no quotes), a newline inside the attribute, and
  a `<script src=…>` with a closing tag all went through untouched. Uploads are served from
  this origin, so each was stored XSS in the builder's own window. The file is parsed now
  and only the elements that draw survive.
- **Custom CSS.** A browser reads `\75 rl(…)` as `url(…)` and `@im\port` as `@import`; the
  patterns did not. It parses with postcss now and judges the decoded form of every name
  and value. `</style>` was untouched by any of it — a stylesheet could close its own tag
  and open a `<script>`, confirmed running on a published page and inside the editor.
- **Where a request came from.** Neuravex has no sign-in on purpose, but that only holds
  for what you type in the address bar. Any page on the web could post to localhost in the
  background and every route did as it was told. An Origin that is not this server's is
  refused; no Origin at all means no page was involved.

### Round 20 — a fresh pass over the whole app

A new pass with the app running: a site made from a template, edited, published, viewed and
downloaded, and every one of the 28 templates rendered and checked for broken references.

- **Two templates shipped a hero with no picture in it.** The AI Upscaler pair built their
  backgrounds with `url('${IMG.abstract}')` instead of `IMG.abstract.src`, so a StockImage
  became the string `[object Object]`: the before-and-after photograph the page is about
  was an empty gradient in the canvas, on the published page and in the downloaded copy,
  and every visit asked the host for a file called "[object Object]". A test now serialises
  every template and fails on `[object Object]`, on `undefined`, or on a `/stock/` path
  with no file behind it.
- **A name with accents lost its letters in the address.** `slugify` kept `[a-z0-9]` and
  turned everything else into a dash, so "Résumé" was published at `/sites/r-sum`, "Crème
  Brûlée" at `/cr-me-br-l-e`, and "Ñandú" at `/and`. Accents are
  separated from their letters and dropped now, and the letters that carry no accent of
  their own (ß, ø, æ, ł) are spelled out: `/cafe-noir`, `/bjork-design`,
  `/weissbier-strasse`. It governs the site address, every page address, and the file names
  in a downloaded copy.
- **The New page dialog promised an address nobody has.** It read `URL: /sites/<site>/auto`
  and stayed that way however much you typed. It shows the site's real slug and the slug
  the title will produce, as the server will store it. Enter finishes the dialog, which it
  previously ignored.
- **Every bundled photograph was described by its credit line.** All 74 read "<Category>
  background photo by <Name>" — and the picker kept even that to itself: choosing a picture
  handed the page a URL and a size, so an image block landed with `alt=""`. All 74 are
  described by what they show now, the description travels with the picture, and words
  written by hand are never overwritten — a borrowed description goes with the picture it
  described, an author's does not.
- **`npm run db:reset` could leave the app with no tables.** The documented way to start
  over emptied the database first and built the new one second; run with Neuravex open —
  which is when anyone runs it — SQLite can refuse the schema halfway, and the app comes
  back throwing "The table `main.Site` does not exist" on every page. The new database is
  built and seeded beside the old one now and only put in its place once it works, so a
  reset that cannot finish leaves the sites untouched and says so.

### Still open from this review

P0-1 is **closed**: **Download files** takes a site off the machine as plain HTML, CSS and
images, and hosting is not something Neuravex does — it is downloaded software, and the
customer hosts where they already do. P1-4 through P1-8 are closed (an autosave close
behind another replaces it, the newest 50 are kept, and a save you made by hand is kept
apart from them; the canvas is the published page; branding cascades; the half-built
settings are gone; SEO, sitemap, robots, canonical, language and favicon all ship), as
are P2-9, P2-11's remote images, P2-13, P2-14 and P2-15.

Still open:

- **P2-11, the multi-page story.** 27 of the 28 templates are single-page, and "+ New page"
  still opens a blank page carrying none of the site's styling.
- **P2-12, the media library.** Usage is shown and deleting a picture in use warns first,
  but there is still no search, no rename, and no description stored against an upload —
  the bundled photographs describe themselves, a file you upload does not.
- **A name in a script with no Latin letters** still slugs to `untitled`, because folding
  accents has nothing to fold. The slug is editable in Settings, which is the answer for
  now; transliterating Cyrillic, Greek or CJK is a bigger piece of work than this round.

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
| Quality | 225 unit tests (sanitization, security, tree utils, revisions, zip, static export, forms, block defaults, site theme, SEO, site archive, CSS scoping, MCP parity, first run, image sizes, clipboard) — all passing; 83 Playwright specs |

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

**Answered, and closed.** *(Round 2, and the scope note above.)* **Download files** hands
the whole site over as ordinary HTML, CSS and images: unpack it, double-click
`index.html`, or drop the folder on any static host. Since Neuravex is downloaded software
rather than a service, that is the whole of the answer — the hosting half of this finding
is not a gap to close but a product Neuravex is not. What remains worth doing here is
making the exported folder as good as it can be, not adding a deploy button.

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
| `Site.theme` (light/dark) | Stored, editable via API, **never read by any renderer** — *removed in round 11* |
| `Site.headHtml` | Writable via `PATCH /api/sites/[id]`, **never rendered**, no UI — so the documented "load Google Fonts / add analytics" path does not exist |
| `Page.scheduledAt` | In the schema, **no scheduling logic anywhere** — *removed in round 11* |
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

**R1. Make "Publish" mean published.** ✅ *Done, in the form this product takes.*
A static export writes real HTML, CSS and assets and hands them over as a zip. The
push-button deploy targets this originally asked for (Netlify, GitHub Pages, Vercel, SFTP)
are **not** planned: Neuravex is downloaded software, not a service, and the customer
hosts wherever they already do. A configured base URL is still worth having so the
exported pages can carry their own canonical tags and a sitemap — that part of this
recommendation stands.

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
