"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PublicBlocks } from "@/components/public/PublicBlocks";
import { BaseBlock } from "@/types";
import { diffPages, type PageChange } from "@/lib/page-diff";

interface Rev {
  id: string;
  title: string;
  content: string;
  manual: boolean;
  name: string | null;
  createdAt: string;
}

interface Props {
  pageId: string;
  /** Changes after each save so the list reloads instead of going stale. */
  refreshKey?: number;
  /** Called before a restore is sent, to put the canvas's unsaved work somewhere first. */
  beforeRestore?: () => Promise<void>;
  /** After a restore, with the id of the version kept of what the page held just before. */
  onRestore?: (undoRevisionId: string | null) => void;
  /** The page as it is on the canvas, to compare a version with. */
  current: { title: string; blocks: BaseBlock[] };
  /** Save what is on the canvas and keep it under `name`; false when it could not be. */
  onKeepVersion: (name: string) => Promise<boolean>;
}

const CHANGE_WORDS: Record<PageChange["kind"], string> = {
  title: "Title changed",
  added: "Added",
  removed: "Taken out",
  changed: "Changed",
  moved: "Moved",
};

/**
 * The page's history: every save kept, named versions above the rest, a
 * preview of each, what has changed since it, and a way back — including
 * back from a restore; see `restoreRevision`.
 */
export function RevisionsPanel({ pageId, refreshKey = 0, beforeRestore, onRestore, current, onKeepVersion }: Props) {
  const [revs, setRevs] = useState<Rev[]>([]);
  const [reload, setReload] = useState(0);
  const [previewing, setPreviewing] = useState<Rev | null>(null);
  const [view, setView] = useState<"look" | "changes">("look");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [naming, setNaming] = useState("");
  const [keeping, setKeeping] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch(`/api/pages/${pageId}/revisions`)
      .then((r) => r.json())
      .then(setRevs)
      .catch(() => {});
  }, [pageId, refreshKey, reload]);

  async function restore(revId: string) {
    setRestoring(revId);
    try {
      await beforeRestore?.();
      const res = await fetch(`/api/pages/${pageId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: revId }),
      });
      const body = await res.json().catch(() => null);
      setPreviewing(null);
      if (!res.ok) {
        setNote("That version could not be put back. Try again.");
        return;
      }
      onRestore?.(typeof body?.undoRevisionId === "string" ? body.undoRevisionId : null);
    } finally {
      setRestoring(null);
    }
  }

  async function keep() {
    const name = naming.trim();
    if (!name) return;
    setKeeping(true);
    setNote("");
    try {
      if (await onKeepVersion(name)) {
        setNaming("");
        setNote(`Kept as “${name}”.`);
        setReload((n) => n + 1);
      } else {
        setNote("That version could not be kept. Try again once the page has saved.");
      }
    } finally {
      setKeeping(false);
    }
  }

  async function rename(id: string, name: string) {
    await fetch(`/api/pages/${pageId}/revisions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId: id, name }),
    }).catch(() => {});
    setRenaming(null);
    setReload((n) => n + 1);
  }

  const previewBlocks = useMemo<BaseBlock[] | null>(() => {
    if (!previewing) return null;
    try {
      const parsed = JSON.parse(previewing.content);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [previewing]);

  const changes = useMemo(
    () => (previewing && previewBlocks ? diffPages({ title: previewing.title, blocks: previewBlocks }, current) : []),
    [previewing, previewBlocks, current],
  );

  const named = revs.filter((r) => r.name);
  const rest = revs.filter((r) => !r.name);

  const row = (r: Rev) => (
    <div key={r.id} className="rounded-lg border border-bg-border bg-bg p-2 text-xs" data-revision={r.name ?? ""}>
      {renaming?.id === r.id ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            rename(r.id, renaming.name);
          }}
        >
          <Input
            autoFocus
            aria-label="Name of this version"
            value={renaming.name}
            maxLength={120}
            onChange={(e) => setRenaming({ id: r.id, name: e.target.value })}
            className="h-7 text-xs"
          />
          <Button size="sm" type="submit">Save name</Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-fg truncate">
              {r.name ? <span className="font-semibold">{r.name}</span> : r.title}
              {r.manual && !r.name ? <span className="ml-1.5 text-[10px] text-brand uppercase tracking-wide">saved</span> : null}
            </div>
            <div className="text-fg-subtle">{new Date(r.createdAt).toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label={r.name ? `Rename “${r.name}”` : "Name this version"}
              title={r.name ? "Rename" : "Name this version"}
              onClick={() => setRenaming({ id: r.id, name: r.name ?? "" })}
              className="w-6 h-6 rounded text-fg-muted hover:text-fg hover:bg-bg-card"
            >
              ✎
            </button>
            <Button size="sm" variant="outline" onClick={() => { setPreviewing(r); setView("look"); }}>
              Preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div data-revisions="">
      <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold mb-3">Versions</div>
      <form
        className="mb-3 space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          keep();
        }}
      >
        <div className="flex gap-1.5">
          <Input
            aria-label="Name for this version"
            value={naming}
            maxLength={120}
            placeholder="Before the redesign"
            onChange={(e) => setNaming(e.target.value)}
            className="h-8 text-xs"
          />
          <Button size="sm" type="submit" variant="outline" loading={keeping} disabled={!naming.trim()} className="shrink-0">
            Keep version
          </Button>
        </div>
        <p className="text-[11px] text-fg-subtle">Saves the page and keeps it under this name. Named versions stay however many saves follow.</p>
        {note ? <p role="status" className="text-[11px] text-fg-muted">{note}</p> : null}
      </form>

      {revs.length === 0 ? (
        <div className="text-xs text-fg-muted">No versions yet. One is kept each time you save, and autosaves within five minutes of each other share one.</div>
      ) : (
        <div className="space-y-2">
          {named.map(row)}
          {named.length && rest.length ? <div className="text-[11px] text-fg-subtle pt-1">Every save</div> : null}
          {rest.map(row)}
        </div>
      )}

      <Modal
        open={!!previewing}
        onClose={() => setPreviewing(null)}
        title={previewing?.name || previewing?.title || "Version"}
        subtitle={previewing ? new Date(previewing.createdAt).toLocaleString() : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPreviewing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => previewing && restore(previewing.id)}
              loading={restoring === previewing?.id}
            >
              Restore this version
            </Button>
          </>
        }
      >
        <div className="p-4 text-xs text-fg-muted border-b border-bg-border bg-bg-soft space-y-3">
          <p>
            Restoring puts this version back on the page. What the page holds now is kept as a version of its own first,
            so the restore can be undone.
          </p>
          <div role="tablist" className="inline-flex rounded-md border border-bg-border overflow-hidden">
            {(["look", "changes"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={view === v ? "px-3 h-7 bg-brand text-white" : "px-3 h-7 text-fg-muted hover:text-fg"}
              >
                {v === "look" ? "What it looked like" : `What changed since (${changes.length})`}
              </button>
            ))}
          </div>
        </div>
        {view === "changes" ? (
          <div className="p-4" data-changes="">
            {changes.length === 0 ? (
              <p className="text-sm text-fg-muted">Nothing: the page is the same as this version.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {changes.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 w-24 text-fg-subtle">{CHANGE_WORDS[c.kind]}</span>
                    <span className="min-w-0 text-fg">
                      {c.kind === "title" ? null : <span className="font-medium">{c.label}</span>}
                      {c.kind === "changed" || c.kind === "title" ? (
                        <>
                          {c.kind === "changed" ? " " : null}
                          <span className="text-fg-muted line-through">{c.before || "—"}</span> → {c.after || "—"}
                        </>
                      ) : c.after || c.before ? (
                        <span className="text-fg-muted"> “{c.after || c.before}”</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          /*
            The version is drawn as the published page, links and all, and
            following one walked out of the editor with whatever had not been
            saved. The canvas cancels its links for the same reason; a slider
            still moves, since it scrolls itself by hand when its link has
            been cancelled.
          */
          <div
            className="public-canvas"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest?.("a[href]")) e.preventDefault();
            }}
          >
            {previewBlocks ? (
              previewBlocks.length > 0 ? (
                <PublicBlocks blocks={previewBlocks} />
              ) : (
                <div className="p-6 text-sm text-fg-muted">This version has no content.</div>
              )
            ) : (
              <div className="p-6 text-sm text-fg-muted">Preview unavailable for this version.</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
