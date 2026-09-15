# Stock photo library

Photos here show up in the editor's **Media → Stock photos** tab so anyone
building a site can drop one in without leaving the app. Unlike
`public/uploads/` (per-install, gitignored, created by users), this folder
is part of the app itself — the files and `manifest.json` are committed to
the repo and ship with every install.

Nothing here is fetched over the network at runtime. Files are bundled
locally, in keeping with the project running fully offline.

## Adding a photo

1. Only use photos you have the right to redistribute — e.g. Unsplash
   License, Pexels License, Pixabay Content License, or public domain
   (CC0 / Wikimedia Commons public-domain works). Keep a record of the
   photographer and source URL for the `credit` / `creditUrl` fields below,
   even when the license doesn't require attribution.
2. Save the file under a category subfolder, e.g. `public/stock/business/office-team-01.jpg`.
   Keep files reasonably sized for the web (a few hundred KB, longest edge
   around 1600–2000px is plenty for block backgrounds).
3. Add an entry to `manifest.json`:

   ```json
   {
     "id": "office-team-01",
     "file": "business/office-team-01.jpg",
     "category": "business",
     "alt": "Team collaborating around a laptop in a bright office",
     "credit": "Jane Photographer",
     "creditUrl": "https://unsplash.com/@janephotographer",
     "license": "Unsplash License"
   }
   ```

   - `id` — unique, stable string (used as the React key).
   - `file` — path relative to `public/stock/`.
   - `category` — short lowercase label; used for the filter chips in the
     picker. Reuse an existing category where it fits (see current
     entries in `manifest.json`) rather than inventing near-duplicates.
   - `alt` — a real description, used as the `<img alt>` on published
     sites.
   - `credit` / `creditUrl` / `license` — shown on hover in the picker.

The `/api/stock` route silently skips any manifest entry whose file is
missing, so a bad path just makes that photo not show up rather than
erroring the whole picker.
