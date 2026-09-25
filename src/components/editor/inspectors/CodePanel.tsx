"use client";
import type { CodeProps } from "@/types";
import { Input, Textarea } from "@/components/ui/Input";
import { handleCodeKeys } from "@/components/blocks/CodeBlock";
import { CODE_LANGUAGES, languageKey } from "@/lib/code-languages";
import { canHighlight } from "@/lib/code-highlight";
import { domId } from "@/lib/dom-id";
import { Field, SegBtns, Select, Toggle, type BlockPanelProps } from "../inspector-fields";

/**
 * The code block's settings, and the code itself.
 *
 * The canvas is where a sample is usually typed, but a long one is easier to
 * paste and look over in a box of its own, so the same text is here too, with
 * the same Tab behaviour as the canvas. The language is a list rather than a
 * text field, but a language this list does not name — stored by an agent or
 * an import — is shown as one more choice instead of being quietly replaced
 * by the first.
 */
export function CodePanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as CodeProps;
  const set = (patch: Partial<CodeProps>) => onChange({ ...block, props: { ...p, ...patch } });
  const hintId = domId(block.id, "code-panel-keys");

  const language = typeof p.language === "string" ? p.language : "";
  const known = CODE_LANGUAGES.some((l) => l.value === languageKey(language));
  const options = [
    ...CODE_LANGUAGES,
    ...(known ? [] : [{ value: language, label: language }]),
  ];

  return (
    <>
      <Field label="Code">
        <Textarea
          rows={12}
          value={typeof p.code === "string" ? p.code : ""}
          onChange={(e) => set({ code: e.target.value })}
          onKeyDown={(e) => handleCodeKeys(e, (code) => set({ code }))}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="Code"
          aria-describedby={hintId}
          placeholder="Type or paste code"
          className="font-mono text-xs leading-relaxed whitespace-pre"
          style={{ tabSize: 2 }}
        />
        <p id={hintId} className="text-[11px] text-fg-subtle mt-1">
          Shown exactly as written. Tab indents by two spaces and Shift+Tab takes them away; press Escape to leave the box.
        </p>
      </Field>
      <Field label="Language">
        <Select
          value={known ? languageKey(language) : language}
          onChange={(v) => set({ language: v })}
          options={options}
        />
        {language && !canHighlight(language) ? (
          <p className="text-[11px] text-fg-subtle mt-1">Named in the corner of the sample, and shown in one colour.</p>
        ) : null}
      </Field>
      <Field label="File name">
        <Input
          value={typeof p.filename === "string" ? p.filename : ""}
          onChange={(e) => set({ filename: e.target.value })}
          placeholder="Optional — e.g. app.js"
          aria-label="File name"
        />
      </Field>
      <Field label="Theme">
        <SegBtns
          value={p.theme === "light" ? "light" : "dark"}
          options={["dark", "light"] as const}
          onChange={(theme) => set({ theme })}
          nameFor={(v) => `${v === "dark" ? "Dark" : "Light"} theme`}
        />
      </Field>
      <Toggle
        label="Wrap long lines"
        checked={p.wrap === true}
        onChange={(wrap) => set({ wrap })}
        hint="Otherwise a long line scrolls sideways inside the sample."
      />
      <Toggle
        label="Show line numbers"
        checked={p.lineNumbers === true}
        onChange={(lineNumbers) => set({ lineNumbers })}
        hint="Left out when the code is copied."
      />
    </>
  );
}
