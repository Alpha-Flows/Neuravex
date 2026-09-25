"use client";
import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import type { CodeProps } from "@/types";
import { cn } from "@/lib/utils";
import { TOKEN } from "@/lib/site-theme";
import { domId } from "@/lib/dom-id";
import { highlight, type CodeToken } from "@/lib/code-highlight";
import { languageKey, languageLabel } from "@/lib/code-languages";
import { indentCode, needsTrailingLine, splitTokenLines } from "@/lib/code-lines";

interface Props {
  props: CodeProps;
  onChange?: (next: CodeProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

/**
 * The keys a code box answers differently from a text box.
 *
 * Tab would otherwise leave the field, which in a code sample is the one
 * keypress somebody is sure to make on purpose — and the text box it lands
 * in next is whatever the browser thinks is next in the builder. So Tab
 * indents and Shift+Tab outdents (see `indentCode`), and Escape is the way
 * out: it gives up focus without deselecting the block, so the next Tab moves
 * on from here. Without Escape a keyboard user would be shut in the box.
 *
 * The edit is written into the field directly and then reported, rather than
 * reported and left for React to write back: a controlled text box whose value
 * is replaced from outside puts the caret at the end, and the indented line
 * is exactly where the caret needs to stay. React sees the value it is handed
 * already in the field and leaves it, and the caret, alone.
 *
 * Shared with the panel, whose text box edits the same code.
 */
export function handleCodeKeys(e: KeyboardEvent<HTMLTextAreaElement>, commit: (value: string) => void): void {
  if (e.nativeEvent.isComposing) return;
  if (e.key === "Escape") {
    // The editor deselects the block on Escape, which would take the panel
    // away from under a keyboard user who only wanted out of the text.
    e.stopPropagation();
    e.currentTarget.blur();
    return;
  }
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  const field = e.currentTarget;
  const next = indentCode(field.value, field.selectionStart, field.selectionEnd, e.shiftKey);
  if (next.value !== field.value) {
    field.value = next.value;
    commit(next.value);
  }
  field.setSelectionRange(next.start, next.end);
}

/** One run of tokens as text and spans. Plain text needs no element of its own. */
function Tokens({ tokens }: { tokens: readonly CodeToken[] }) {
  return (
    <>
      {tokens.map((token, i) =>
        token.kind === "plain" ? token.text : <span key={i} className={`nvx-tok-${token.kind}`}>{token.text}</span>,
      )}
    </>
  );
}

/**
 * A code sample, shown exactly as it was written.
 *
 * The text is only ever a child of `<code>`, so React escapes it: a sample of
 * HTML is shown as HTML instead of becoming part of the page, and nothing
 * here is sanitised, because sanitising would change the sample. Colour comes
 * from `highlight`, which hands back pieces of text rather than markup.
 *
 * Editing is a plain text box laid exactly over the drawn sample, not a
 * contentEditable. A contentEditable loses indentation to the browser's own
 * whitespace handling, turns a pasted tab into whatever it likes, and puts
 * the text through the inline-HTML sanitiser on the way out — which would
 * rewrite `a < b && c` in a code sample the way it should in a paragraph. The
 * box's own text is transparent; what shows is the drawing underneath, so the
 * canvas has the published page's colours while the caret, the selection and
 * the typing are the text box's. The drawing, not the box, sets the height,
 * so the box grows with the code without a script measuring it.
 *
 * On the published page there is no text box and nothing that needs one. A
 * sample that does not wrap scrolls sideways inside its own frame, and that
 * frame takes keyboard focus so it can be scrolled without a mouse; a sample
 * that wraps never scrolls, so it is not made a stop in the Tab order for
 * nothing.
 */
export function CodeBlock({ props, onChange, disabled, blockId }: Props) {
  const code = typeof props.code === "string" ? props.code : "";
  const tokens = useMemo(() => highlight(code, props.language), [code, props.language]);
  const lines = useMemo(() => (props.lineNumbers ? splitTokenLines(tokens) : null), [tokens, props.lineNumbers]);

  const label = languageLabel(props.language);
  const filename = typeof props.filename === "string" ? props.filename.trim() : "";
  const editing = !disabled && onChange != null;
  const scrolls = !props.wrap && !editing;
  const name = filename ? `Code sample, ${filename}` : label ? `${label} code sample` : "Code sample";
  const hintId = domId(blockId, "code-keys");

  const style = {
    borderRadius: TOKEN.radius("0.5rem"),
    // How wide the numbers' gutter is. Only the count of digits changes it,
    // and the text box on the canvas is inset by the same amount.
    ...(lines ? { "--nvx-code-digits": String(String(lines.length).length) } : {}),
  } as CSSProperties;

  return (
    <figure
      className={cn(
        "nvx-code",
        props.theme === "light" ? "nvx-code--light" : "nvx-code--dark",
        props.wrap && "nvx-code--wrap",
        lines && "nvx-code--numbered",
      )}
      style={style}
      data-language={languageKey(props.language) || undefined}
    >
      {filename || label ? (
        <figcaption className="nvx-code__bar">
          {filename ? <span className="nvx-code__file">{filename}</span> : null}
          {label ? <span className="nvx-code__lang">{label}</span> : null}
        </figcaption>
      ) : null}
      <pre
        className="nvx-code__pre"
        tabIndex={scrolls ? 0 : undefined}
        role={scrolls ? "region" : undefined}
        aria-label={scrolls ? name : undefined}
      >
        <code className="nvx-code__code">
          {/* On the canvas the text box below says all of this, so the
              drawing is kept out of a screen reader's way there. */}
          <span className="nvx-code__text" aria-hidden={editing ? true : undefined}>
            {lines ? (
              lines.map((line, i) => (
                // Each line keeps its own newline, so the text copied from a
                // numbered sample — and the sample with no stylesheet at all —
                // still breaks where it did.
                <span key={i} className="nvx-code__line">
                  <Tokens tokens={line} />
                  {i < lines.length - 1 ? "\n" : null}
                </span>
              ))
            ) : (
              <>
                <Tokens tokens={tokens} />
                {needsTrailingLine(code) ? "\n" : null}
              </>
            )}
          </span>
          {editing ? (
            <>
              <textarea
                className="nvx-code__input"
                value={code}
                onChange={(e) => onChange({ ...props, code: e.target.value })}
                onKeyDown={(e) => handleCodeKeys(e, (value) => onChange({ ...props, code: value }))}
                wrap={props.wrap ? "soft" : "off"}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                placeholder="Type or paste code"
                aria-label={filename ? `Code in ${filename}` : "Code"}
                aria-describedby={hintId}
              />
              <span id={hintId} className="sr-only">
                Tab indents by two spaces and Shift+Tab takes them away. Press Escape to leave the code.
              </span>
            </>
          ) : null}
        </code>
      </pre>
    </figure>
  );
}
