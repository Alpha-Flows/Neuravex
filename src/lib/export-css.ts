import { readFile } from "fs/promises";
import { join } from "path";
import tailwindConfig from "../../tailwind.config";

/**
 * The stylesheet that ships with a downloaded site.
 *
 * Tailwind is run over the exported HTML itself, so the file holds exactly the
 * utilities those pages use and nothing else — a handful of kilobytes rather
 * than the whole application stylesheet. The plain CSS in globals.css comes
 * along too, since the public pages lean on it for the column rules and the
 * template animations.
 */
export async function buildExportCss(documents: string[]): Promise<string> {
  const [{ default: postcss }, { default: tailwindcss }] = await Promise.all([
    import("postcss"),
    import("tailwindcss"),
  ]);

  const globals = await readFile(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const result = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: documents.map((raw) => ({ raw, extension: "html" })),
    }),
  ]).process(globals + EXPORT_OVERRIDES, { from: undefined });

  return result.css;
}

/**
 * globals.css dresses the builder: a dark page behind the canvas, and hover
 * chrome for blocks being edited. A downloaded site is neither, so undo the
 * bits that would follow it out of the app.
 */
const EXPORT_OVERRIDES = `
/* --- added when exporting: this is a site, not the builder UI --- */
:root { color-scheme: light; }
html, body {
  background: #ffffff;
  color: #0f172a;
}
.editor-outline, .editor-toolbar { display: none !important; }
`;
