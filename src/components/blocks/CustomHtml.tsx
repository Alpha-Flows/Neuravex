"use client";
import { useState } from "react";
import { HtmlProps } from "@/types";
import { sanitizeHtml } from "@/lib/sanitize";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Props {
  props: HtmlProps;
  onChange?: (next: HtmlProps) => void;
  disabled?: boolean;
}

export function CustomHtml({ props, onChange, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.html);

  if (disabled) {
    return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }} />;
  }

  function open() {
    setDraft(props.html);
    setEditing(true);
  }

  return (
    // The markup is drawn exactly as the page draws it — no dashed frame, no
    // padding of its own and no button taking a line underneath. Those three
    // things moved everything below them, so a block of custom HTML sat in a
    // different place on the canvas than on the published page. The one
    // control it needs floats over the block instead, and appears when the
    // block is hovered or selected.
    <div className="relative">
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }} />
      {(props.html ?? "").trim() ? null : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">
          Empty HTML block — press Edit HTML to put something in it.
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); open(); }}
        className="nvx-block-chrome absolute left-2 top-2 z-10 rounded-md border border-bg-border bg-bg-card/95 px-2 py-1 text-xs text-fg-muted shadow-lg hover:text-fg"
      >
        Edit HTML
      </button>

      {/*
        This used to be a prompt(). A prompt cannot hold a newline, so any
        HTML worth embedding arrived as one unreadable line — and pressing
        Escape or Cancel by reflex was indistinguishable from an empty string
        in older browsers. An editor with room to work is the least this
        deserves.
      */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Custom HTML"
        subtitle="Scripts and event handlers are stripped when the page renders."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { onChange?.({ html: draft }); setEditing(false); }}>Save</Button>
          </>
        }
      >
        <div className="p-5" onClick={(e) => e.stopPropagation()}>
          <Textarea
            rows={14}
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="font-mono text-xs leading-relaxed"
            placeholder="<div>…</div>"
          />
        </div>
      </Modal>
    </div>
  );
}
