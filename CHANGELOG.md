# Changelog

All notable changes to Neuravex are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Everything in this entry answers a finding in `docs/SECURITY_REVIEW.md`; the
identifier in brackets is the finding it closes.

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

- `SECURITY.md`, this changelog, and a filled-in licence. [NVX-039]
- `npm run backup`, which takes a consistent snapshot of a live database and
  copies the uploads with it. [NVX-037]
- `DELETE /api/submissions/[id]`, a retention sweep, paging and CSV/JSON export
  in the submissions viewer. [NVX-058]
- A tested `Dockerfile` and `.dockerignore`. [NVX-011]
- A browser-test job and an advisory report in CI, with actions pinned by
  commit and a `permissions:` block; `dependabot.yml`. [NVX-029, NVX-060]

### Changed

- Node 20 is the documented and enforced minimum. [NVX-028]
- The legal wizard asks about the hosting DPA and what happens to form input
  instead of assuming answers, and the generated text matches how the site is
  actually served. [NVX-020, NVX-040]
- The privacy audit reads the sanitised HTML the renderer produces, so a
  tracker in a text block is found and a plain hyperlink is no longer reported
  as one. [NVX-021, NVX-056, NVX-057]
- `INSTALL.md`'s reverse-proxy recipe is safe as pasted, and its MCP tool table
  is generated from the server's own registrations. [NVX-036, NVX-038]

### Fixed

- The SQLite PRAGMAs the web app documents are actually executed. [NVX-030]
- The download, sitemap and robots routes no longer derive their origin from a
  client-supplied `X-Forwarded-Proto`. [NVX-026, NVX-051]
- A malformed percent-encoded asset reference skips that reference instead of
  failing the whole download. [NVX-041]
- The upload route answers 400 on a malformed request instead of 500.
  [NVX-047]

## [0.1.0]

First release.
