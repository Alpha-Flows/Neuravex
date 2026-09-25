"use client";
import { useEffect, useState } from "react";
import type { AudioProps } from "@/types";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "../MediaPicker";
import { describeRemoteAudio, remoteAudioProblem } from "@/lib/audio-address";
import { fileNameFromUrl } from "@/lib/media";
import { Field, type BlockPanelProps } from "../inspector-fields";

/**
 * The name the library knows an upload by, once it has been asked.
 *
 * A block stores the file's address, and an upload's address is the name it
 * was stored under — "mu59seflqpe0.mp3" — which tells nobody which episode
 * this is. The library remembers what the file was called when it arrived
 * and whatever it has been renamed to since, so the panel asks it, again
 * whenever the file changes or the picker closes (a rename happens there).
 */
function useLibraryName(src: string, asked: number): string | null {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!src.startsWith("/uploads/")) return;
    let live = true;
    fetch("/api/media")
      .then((r) => (r.ok ? r.json() : []))
      .then((files: { url: string; name: string }[]) => {
        if (live && Array.isArray(files)) setNames(Object.fromEntries(files.map((f) => [f.url, f.name])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [src, asked]);
  return names[src] ?? null;
}

/**
 * The typed address, held here until it is finished.
 *
 * It used to go into the block on every keystroke, and the block is an
 * `<audio preload="metadata">` on the canvas — so typing one address asked
 * for thirty-four on the way to it: `https://c/`, `https://cd/` and thirteen
 * more hosts nobody named, and five paths on the builder itself. The builder contacts nothing of its
 * own accord, and a half-typed address is not the author's choice either.
 * So the address is taken when the field is left or Enter is pressed, and
 * the warning is worked out from the draft, so it still answers as you type.
 */
function WebAddressField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value);
  const problem = remoteAudioProblem(draft);
  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };
  return (
    <>
      <Input
        value={draft}
        placeholder="https://example.com/episode-1.mp3"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
          }
        }}
      />
      {problem ? <p className="text-xs text-amber-400 mt-1.5">{problem}</p> : null}
    </>
  );
}

export function AudioPanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as AudioProps;
  const set = <K extends keyof AudioProps>(key: K, value: AudioProps[K]) =>
    onChange({ ...block, props: { ...p, [key]: value } });

  const [pickerOpen, setPickerOpen] = useState(false);
  /** Bumped when the picker closes, so a rename made there shows here. */
  const [asked, setAsked] = useState(0);

  const src = p.src ?? "";
  const fromLibrary = src.startsWith("/uploads/");
  const libraryName = useLibraryName(src, asked);
  const current = !src ? null : fromLibrary ? libraryName ?? fileNameFromUrl(src) : describeRemoteAudio(src);

  return (
    <>
      <Field label="Sound file">
        <div className="space-y-2">
          {current ? (
            <div className="flex items-center gap-2 rounded-md border border-bg-border bg-bg px-2.5 py-2">
              <span aria-hidden className="text-fg-subtle">♪</span>
              <span className="flex-1 min-w-0 truncate text-sm text-fg" title={src}>{current}</span>
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">None chosen yet — the published page shows nothing until there is one.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="flex-1">
              Choose audio file
            </Button>
            {src ? (
              <Button size="sm" variant="ghost" onClick={() => set("src", "")}>Remove</Button>
            ) : null}
          </div>
        </div>
      </Field>

      <Field label="Or an address on the web">
        {/* Keyed on what is stored, so the draft starts again from it whenever
            it changes some other way — a file picked, an undo. */}
        <WebAddressField
          key={fromLibrary ? "" : src}
          // A library file is shown above, not here: its address is this
          // site's own, and typing over it by accident would lose it.
          value={fromLibrary ? "" : src}
          onCommit={(next) => set("src", next)}
        />
        <p className="text-[11px] text-fg-subtle mt-1.5">
          A file from your library travels with the downloaded site. One from the web needs a connection,
          and the privacy notice names the site it comes from. It is also the way to use a recording too
          large to upload.
        </p>
      </Field>

      <Field label="Title">
        <Input value={p.title} placeholder="Episode 4 — The long winter" onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Description">
        <Textarea
          rows={3}
          value={p.description}
          placeholder="Optional — a line or two about what is in it."
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <MediaPicker
        open={pickerOpen}
        kind="audio"
        onClose={() => {
          setPickerOpen(false);
          setAsked((n) => n + 1);
        }}
        onSelect={(url) => set("src", url)}
      />
    </>
  );
}
