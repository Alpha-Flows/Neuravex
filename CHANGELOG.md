# Changelog

All notable changes to Neuravex are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-26

The first release. Where an entry answers a finding in
`docs/SECURITY_REVIEW.md`, the identifier in brackets is the finding it closes.

### Security

- Two commits before the audit laid the ground the rest of this section
  builds on. `42e842f` replaced the regular-expression HTML sanitiser with
  `sanitize-html`, put SQLite into WAL mode with a busy timeout so the MCP
  server and the web app can share one database, stripped scripts, foreign
  objects and inline styles out of uploaded SVGs, and validated the block
  trees the MCP server saves. `6e2b7e9` added the CI workflow and the first
  security tests.
- The upload route is the one route the proxy does not run on, because Next
  copies every body the proxy sees into memory and cuts it off at 10 MB. It
  runs the proxy's Host allowlist and Origin check itself, before it reads a
  byte, and a test fails if any other route leaves the proxy or one that does
  skips the check. An upload is written to disk as it arrives, so its size no
  longer decides how much memory the server holds.
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

- **Releases.** A `v*` tag runs `.github/workflows/release.yml`: it stops
  unless the tag agrees with `package.json` and a dated changelog section,
  runs all of CI, packs the tag as `.tar.gz` and `.zip` with a `SHA256SUMS`,
  unpacks the archive into an empty folder, installs it and starts it the way
  a customer would, and only then drafts a GitHub release with the changelog
  section as its notes. `RELEASING.md` has the steps around it; `npm run
  check` runs everything CI runs, in order, and `npm run smoke` starts the
  launcher from nothing and checks it answers, stops, refuses a port another
  program holds, finds a copy of itself already running, and says so when
  its server dies. CI runs the smoke test on every change. `INSTALL.md` now
  starts from a release, and says how to update one.
- **`GET /api/health`**, which says it is Neuravex, which version, and
  whether the database can be reached and the uploads folder written to,
  answering 503 when either cannot. The launcher waits on it, the Docker
  image's health check calls it, and it is the address for a proxy's or a
  monitor's check.
- **Running as a service.** `--no-browser` (or `NEURAVEX_NO_BROWSER=1`)
  starts the launcher without opening a tab, and `INSTALL.md` has a systemd
  unit that restarts it on failure and `--restart unless-stopped` for Docker.
- The version is on the dashboard, beside where the data is kept.
- **Named versions, what changed, and a way back from a restore.** A page's
  history takes a name for the version on the canvas — "Before the
  redesign" — and a named version is never pruned or folded into the
  autosave after it, however many saves follow, and keeps its name through
  the trash. Each version's preview says
  what has changed since, block by block: added, taken out, changed with the
  words either way, and moved. Restoring keeps what the page held first, and
  the editor offers to undo the restore until it is dismissed.
- **Find and replace across the site.** "Find and replace" on the dashboard
  searches every page, the menu, the footer and the site's settings, lists
  each place with the words either side of it, and replaces in the places
  left ticked. Only words change, never the markup around them. A phone
  number or email address is changed in the `tel:` and `mailto:` links to it
  as well, so a "Call us" button does not go on ringing the old number. A
  synced block is changed on every page that has it, the generated legal
  pages are listed but left to the legal details, and each page changed is
  kept as a version named for the search first.
- **Several blocks at once.** Shift- or ⌘/Ctrl-click adds a block to the
  choice, and the inspector turns into a panel that puts them in a new
  section where the first of them was, moves them together to the end of any
  section or column, or deletes them; so does Delete.
- **Reordering without a mouse.** Every block's toolbar has ↑ and ↓, and
  Alt+↑/↓ moves the chosen block among its neighbours, stepping over a
  floating block, which takes no room in the list.
- **A warning when two editors meet.** An editor says which version of the
  page it started from, and a save made against one that has since been
  replaced — by a second tab, the MCP agent, or a rename elsewhere moving
  this page's links — is refused rather than written. The editor then offers
  the newer version or its own over the top, and either way the one not kept
  goes into the page's history. Only what a save would write back counts: a
  synced block brought up to date from another page, the pages put in a new
  order on the dashboard or a translation linked is no reason to ask. The
  MCP server's `get_page` returns the version and `save_page` takes it as
  `expectedVersion`.
- **The site's address.** Settings → SEO takes the address the downloaded
  site will be put at. With it the download writes each page's canonical
  link, its other-language versions and its social picture as full
  addresses, carries a `sitemap.xml` and names it in `robots.txt`, gives the
  feed full links, and anchors `404.html` to the site's folder rather than
  the root of the domain. The check before publishing asks for it while it is
  missing.
- **Structured data.** Once Settings → SEO says who runs the site — a bakery,
  a shop, a practice, a person — the home page describes the business to
  search engines as schema.org data, from the name, address, phone and email
  in the legal details and the footer's profiles; a person's address is never
  given. Every accordion item that asks a question is given with its answer
  as an FAQ, which the block can turn off. The data goes into the download
  too, the one kind of script it keeps, with its addresses moved into the
  folder.
- **Backups, and a way to import them.** "Back up this site" on the
  dashboard is one zip holding every page, setting and upload the site uses,
  with what the library knew about each file. "Import a site" beside "New
  site" brings a backup or a JSON export back, sending each file through the
  upload route one at a time, so a backup of any size goes in without a new
  way into the server.
- **A site in more than one language.** A page says which language it is
  written in, and pages that are translations of one another are linked from
  its settings, where a draft copy to translate is made in one step. Each page
  carries its own `<html lang>`; a switcher in the header goes to the same
  page in every other language, or to that language's home page; the menu
  shows each language its own pages under their own titles; and every version
  names the others to search engines with `hreflang`. A written header places
  the switcher with `{languages}`.
- **Old addresses keep working.** A published page renamed leaves its old
  address forwarding to the new one, in the builder and in the download,
  where a small page under the old file name sends visitors on. The page's
  settings list its old addresses, and each can be let go.
- **Lighter pictures.** A photograph uploaded is redrawn in the browser no
  wider than 2400 pixels and saved as WebP, with smaller copies at 480, 960
  and 1600 pixels that a published page offers as `srcset`, so a phone is
  sent a picture its size. Nothing is installed for it, and it can be turned
  off in the library for a picture that should keep every pixel. The copies
  go into the download and are deleted with their picture.
- **Crops that keep what matters.** An image block can be cut to a square,
  landscape, wide or portrait shape, and a point chosen on any cropped
  picture — an image block, a section's or a column's background, a gallery
  tile, a slide — stays in view whatever shape the window cuts it to.
- **A check before publishing.** "Check the site" on the dashboard lists
  pictures with no description, buttons that go nowhere, links to drafts, to
  pages that do not exist and to section names no page has, pages with no
  search description, headings that skip a level, and pictures heavier than
  a page needs. Each finding opens its page with the block selected.
- **A blog.** Any page can be a post, with a date, an author, a summary, a
  cover and tags, set in its page settings; the dashboard lists posts apart
  from pages and makes new ones. A post is headed with its details, kept out
  of the menu, and listed newest first by a new Blog posts block — cards or a
  list, all posts or one tag — which reads the site's posts each time it is
  drawn, so a new post appears without the page being touched. The first post
  of a site brings a draft Blog page with that block on it. The site gains an
  Atom feed at `/sites/<site>/feed.xml`, linked from every page, and the
  download carries it as `feed.xml` with addresses that work wherever the
  folder is put.
- **Synced blocks.** "Save for reuse" can keep every copy the same. A copy
  changed on any page is written into every other copy, on every page, when
  that page is saved; a copy placed twice on one page is edited as one; and
  an editor left open on an old copy catches up rather than putting the old
  words back. A synced copy is marked on the canvas and in the inspector,
  and can be detached to become its own.
- **Templates of one's own.** A site can be kept as a template from its
  dashboard — every page, setting, menu and footer — and a page from its page
  settings. Both are offered, and can be deleted, where new sites and new
  pages are made, and what is made from them has its links moved to its own
  address.
- **Duplicate a site.** The dashboard copies a whole site, pages and settings,
  to a new address, with every link inside it pointed at the copy.
- **A site's own 404 page.** Any page can be the one shown, with the site's
  header and footer and a 404 status, at an address that finds nothing. It is
  kept out of the menu and the sitemap, and the download carries it as
  `404.html`, the name static hosts look for.
- **A logo in the header.** A picture from the library takes the place of
  the coloured square, at a height chosen in the Header tab, with the site's
  name beside it or not. Alone, the picture is read out as the site's name.
- **A menu arranged by hand.** A Menu tab lists every page: each can be given
  a shorter label, left out of the menu, moved, or filed under another entry,
  which the header opens as a dropdown — on hover and from the keyboard, in
  CSS alone, so it works in the download — and lists indented in the phone
  menu. Links to other sites, to a page here or to a named section can be
  added, and a heading with no address only opens its dropdown. A page made
  later is added at the end. Pages are named by id, so a rename leaves the
  menu as it was; links in it follow a rename like every other link.
- **A laid-out footer.** A Footer tab builds one from a line about the site,
  an address, phone and email, the site's profiles, up to four columns of
  links, a copyright line with `{year}` and `{name}`, and a background whose
  text colour follows it. The legal links are drawn beneath it on every
  page. Custom footer HTML still wins where there is some, and a site with
  neither keeps the one-line footer.
- **Links to a named section.** A section can be given a name, which it
  carries as its id; every link field lists the named sections of this page
  and of the site's other pages, and the header clears the section it lands
  on. A published page scrolls there smoothly unless the visitor has asked
  for less motion. A `#name` typed on a button or in the menu reaches the
  section too, as one typed into text always would have.
- **Scroll-in motion.** Any block can fade in, rise, come from either side or
  grow as it scrolls into view, done with a scroll-driven CSS animation, so
  the published page and the download run no script for it. Browsers without
  scroll-driven animations, and visitors who ask for less motion, see the
  block as it is. It plays in Preview and not while editing.
- **A site palette.** Up to six brand colours beside the accent, set in the
  site's settings and offered as swatches in every colour field and in the
  text toolbar. A block given one stores a reference to its slot, so changing
  the colour in settings changes every block that took it, on every page and
  in the download; a slot taken away leaves those blocks in the colour it
  last was. A button or a section filled with a palette colour picks readable
  text from the slot, and follows it too.
- **Text sizes for the whole site.** Heading 1 to 4 and body text are set
  once in the Theme tab, and every heading and text block follows them —
  a heading at the size for its level, or the level its own Size names, and
  text blocks scaled from the body size by their Small to X-Large. On a
  narrow window a heading is four fifths of its size, the step the old sizes
  took. Unset, nothing changes.
- **More formatting for selected text:** underline, strikethrough, a text
  colour, a highlight — the site's palette and accent among the choices — and
  Clear formatting, which takes all of it off and leaves links alone.
- **Gradient fills.** A section or a single column can be filled with two
  colours blended top to bottom, left to right or diagonally, instead of one.
  Readable text is chosen for it the way it is for a flat colour, and the
  download carries it as it is drawn.
- **A frame on every block.** Any block can carry room inside and around it,
  a border, rounded corners, a shadow and a fill, set from a Frame panel in
  the inspector beside Depth. The frame sits on its own element inside the
  block's place on the page, so a block on the page keeps its gutter and a
  floating block keeps its position, and it is drawn by one component on the
  canvas and the published page alike. It is stored as `box` beside `layer`,
  repaired by the validator like everything else, and an absent one draws a
  block exactly as before.
- **Fonts to pick from.** The body and heading fonts are picked from sixteen
  bundled typefaces — Inter, Roboto, Open Sans, Montserrat, Nunito, Work
  Sans, DM Sans, Source Sans 3, Space Grotesk, Playfair Display, Lora,
  Merriweather, Source Serif 4, EB Garamond, Oswald and JetBrains Mono — each
  shown in itself, all under the SIL Open Font License and served from
  `public/fonts/`, so they look the same on every visitor's screen with
  nothing fetched from anybody else's server. A page asks only for the fonts
  it uses, and for Latin Extended only when it has a letter from it. A site
  written before this with one of those names typed into the font box now
  gets the file.
- **Fonts of your own.** A .woff2, .woff, .ttf or .otf file is uploaded from
  the Theme tab and named — the name, weight and style are read from the file
  name to start with — and then offered in both pickers. Two files under one
  name are one family with two weights. The list is stored on the site as
  `fonts`, repaired to plain names and upload paths before it goes into a
  stylesheet.
- A downloaded site carries the font files its pages use in `fonts/`, each
  with its licence beside it, and the pages point at them there.
- **Forms ask for more than text.** A form's fields can be a phone number, a
  number, a date, a dropdown, one choice of several, several choices, or a
  privacy checkbox whose sentence links the site's Datenschutzerklärung, and
  any field can carry a placeholder and a line of help beneath it. The panel
  adds the privacy checkbox linked to the notice when the legal pages exist.
- **A downloaded form can send.** A form's settings name where the downloaded
  copy sends its answers — a form service's https address, such as
  Formspree, or one email address — and the exported page's policy opens
  `form-action` for that origin alone. The privacy audit reports a form
  service as where answers go, and the notice names it. The builder's own
  pages store answers in the builder as before.
- **Forms keep programs out** with a hidden trap field — a filled one is
  thanked and nothing is stored — and a minimum time to fill the form in: an
  answer sent within three seconds of the form appearing is refused with a
  message asking the visitor to press Send again.
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

- The package is called `neuravex`, and names its repository.
- "Delete site" is on the Advanced tab of the site's settings, in a danger
  zone of its own, instead of in the footer one button from Save.
- "Delete forever" in the trash asks first, in the row, saying it is the last
  copy.
- The double-click launchers look for Node where Homebrew and nvm put it,
  and say so plainly when it is not there, instead of adding one machine's
  own Node folder to the path.
- "Check the site" and "Find and replace" sit beside "New page" on the
  site's dashboard rather than in its header, which had run out of room and
  ran off the side of a 1024-pixel window with both of them in it.
- The page history lists every named version (up to a hundred) as well as
  the newest fifty saves, so a named version does not drop out of sight
  fifty saves after it was kept.
- Uploads have a limit for each kind of file instead of 10 MB for everything:
  250 MB for a video, 50 MB for a sound, 10 MB for a picture or a document.
  The picker refuses a file over its limit before sending any of it. Scripts
  that post a multipart form still can, up to 10 MB; anything larger is sent
  as the file itself with its name in an `X-File-Name` header.
- An uploaded file is streamed when it is served, including the parts a video
  player asks for, rather than read whole for every request.
- The site download is streamed as it is made. Pictures, sounds and videos
  go in as they are instead of being deflated, the pages are still
  compressed, and a site too large for a ZIP (4 GB) is refused with a message
  rather than failing part-way. The example nginx configuration in
  `INSTALL.md` allows a body of 251 MB to match.
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

- The launcher took any answer below 500 on its port as its own server
  being ready. With another program on the port it printed "Ready!", opened a
  tab on that program and exited 0. It now checks the port before it builds:
  a copy of Neuravex already there is opened, anything else is named with the
  command that avoids it, and only Neuravex's own health answer counts as
  ready. When its server stopped on its own later, the launcher left quietly
  with it, exit 0; it now says so and exits with a failure a service manager
  restarts on. An older Node or a port that is not a number is said in words.
- A database another program held for longer than SQLite's five-second wait
  — the MCP agent saving, a backup, an import — turned whatever the editor
  was saving into a bare 500. Every query now waits it out, twice more, and a
  save that still cannot answers 503 with a sentence saying why.
- Dialogs let Tab walk out into the page behind them and dropped focus at
  the top of the document when they closed; five of the six drawn by hand
  did not say they were dialogs at all. Every one now keeps Tab inside,
  closes on Escape and gives focus back to what opened it.

- A downloaded page could come out with its title, canonical link and social
  tags in a hidden element in the body instead of in the head. Next streams a
  page's metadata after the head for any client it does not take for a
  crawler, the download fetches pages as such a client, and the script that
  would have moved them is removed on the way out; which pages it happened to
  depended on how quickly the database answered. Metadata is always in the
  head now.
- A site imported beside the one it was exported from kept every link
  pointing at the original's address, so its buttons led back into the other
  site. An import moves them, as a copy of a site does.
- Every published page reported a refused `eval` to the terminal on every
  visit: the validator's schema library checked whether it could compile its
  parsers, and the page's own security policy said no. It no longer asks in
  the browser.
- A page renamed in the editor, where nearly every page is renamed, left
  every link to it on the site's other pages pointing at its old address;
  only a rename from the dashboard moved them. Every way of renaming a page
  moves them now, the MCP server's included.
- A body font chosen in site settings reached the editor's canvas and no
  published page. The published layout gives `<body>` the builder's own
  sans-serif as a class, every block inherited it from there, and the site's
  font was set only on `:root`. It is set on the body now.
- A form field could not be made required in the panel at all, though every
  template's form had required fields; and no label was tied to its field, so
  a screen reader named none of them. Each field's label is its field's name
  now, choices are grouped under their question, and help is read out with
  the field.
- A form label typed as "Name & address" in the panel came back as
  "Name &amp; address" once edited on the canvas: it was stored as plain text
  and drawn as HTML. Labels are stored as inline HTML, like every other piece
  of rich text.
- A form whose send failed could not be sent again without reloading the page.
- A link to `#`, the top of the page, was stored as `#c-` and went nowhere.
  It stays `#`, and links already stored as `#c-` are read back as `#`.
- The download read only the first address in a `srcset`, so the larger
  sizes after it would have been left pointing at the builder. Nothing on a
  page carries one yet — the sanitiser drops `srcset` from content and no
  block writes one — so this is fixed before it can bite: every address in
  the list is copied and made relative, a `data:` picture's comma included.
- An archive between 10 and 32 MB could not be imported: the route allowed
  32 MB, but Next had already cut the body off at 10 and the import failed as
  "not valid JSON". The limit is now the 10 MB Next passes on, and a larger
  archive is refused for its size.
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

[Unreleased]: https://github.com/Alpha-Flows/Neuravex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Alpha-Flows/Neuravex/releases/tag/v0.1.0
