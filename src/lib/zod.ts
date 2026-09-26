import { z } from "zod";

/**
 * No compiled parsers in the browser.
 *
 * `block-tree` runs in every published page, because the blocks check their own
 * props as they draw. zod compiles an object's parser with `new Function` when
 * it can, and finds out whether it can by calling `Function("")` the moment the
 * first object schema is built. A published page's policy refuses that,
 * as it should, so every page view by every visitor filed a CSP violation and
 * printed "CSP refused script-src … from eval" in the owner's terminal — the
 * one place a real refusal is meant to show up, now showing one on every visit.
 * Nothing was blocked that mattered; zod falls back to parsing without it. So
 * the browser is told not to try, before any schema exists. The server keeps
 * the compiled parsers, which is where the saving is.
 *
 * A module of its own, imported instead of `zod` by everything that builds a
 * schema, because the setting has to be made before the first schema is: an
 * import is evaluated before the body of the module that imports it.
 */
if (typeof window !== "undefined") z.config({ jitless: true });

export { z };
