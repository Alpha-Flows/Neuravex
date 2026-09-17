/**
 * Confine a stylesheet to one part of the page.
 *
 * A site's custom CSS belongs to the published page, where it owns the whole
 * document. The editor needs to show it too — a canvas that ignores it is not
 * showing what will ship — but there it has to stay inside the canvas: a rule
 * on `body` or `a` would otherwise repaint the builder's palette and inspector
 * around it.
 *
 * Every selector is prefixed with the scope. `html`, `body` and `:root` become
 * the scope itself, since inside the canvas that is what they mean.
 */

const ROOTS = new Set(["html", "body", ":root", "*"]);

/** At-rules whose contents are not selectors and must be left alone. */
const OPAQUE_AT_RULES = /^@(font-face|keyframes|-\w+-keyframes|page|counter-style|property|charset|namespace|import)/i;

/** At-rules that wrap ordinary rules, whose insides do need scoping. */
const NESTING_AT_RULES = /^@(media|supports|container|layer|scope)/i;

function scopeSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  if (ROOTS.has(trimmed.toLowerCase())) return scope;
  // `body.dark p` keeps its meaning as `.scope.dark p` would not, so the root
  // is simply dropped and the rest hangs off the scope.
  const withoutRoot = trimmed.replace(/^(html|body|:root)\b\s*/i, "");
  return `${scope} ${withoutRoot || ""}`.trim();
}

function scopeSelectorList(selectors: string, scope: string): string {
  return selectors
    .split(",")
    .map((s) => scopeSelector(s, scope))
    .filter(Boolean)
    .join(", ");
}

/**
 * Rewrites `css` so every rule applies only inside `scope`.
 *
 * This is a small brace-matching pass, not a full CSS parser: it handles the
 * shapes a stylesheet is written in — plain rules, `@media` and friends around
 * them, and at-rules like `@font-face` that it leaves untouched.
 */
export function scopeCss(css: string, scope: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < css.length) {
    // Anything before the next rule: whitespace, comments, or a bare at-rule.
    const braceAt = css.indexOf("{", i);
    const semicolonAt = css.indexOf(";", i);

    if (braceAt === -1) {
      // No rule left — keep whatever trails (a comment, usually).
      const rest = css.slice(i).trim();
      if (rest) out.push(rest);
      break;
    }

    // A statement at-rule such as `@charset "utf-8";` ends before the brace.
    if (semicolonAt !== -1 && semicolonAt < braceAt) {
      const statement = css.slice(i, semicolonAt + 1).trim();
      if (statement) out.push(statement);
      i = semicolonAt + 1;
      continue;
    }

    const prelude = css.slice(i, braceAt).trim();
    const body = readBlock(css, braceAt);
    if (body === null) break;

    if (OPAQUE_AT_RULES.test(prelude)) {
      out.push(`${prelude} {${body.content}}`);
    } else if (NESTING_AT_RULES.test(prelude)) {
      out.push(`${prelude} {\n${scopeCss(body.content, scope)}\n}`);
    } else {
      const selectors = scopeSelectorList(prelude, scope);
      if (selectors) out.push(`${selectors} {${body.content}}`);
    }

    i = body.end;
  }

  return out.join("\n");
}

/** The contents of the block opening at `open`, and where it ends. */
function readBlock(css: string, open: number): { content: string; end: number } | null {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return { content: css.slice(open + 1, i), end: i + 1 };
    }
  }
  // Unbalanced braces: take what is there rather than dropping the lot.
  return { content: css.slice(open + 1), end: css.length };
}
