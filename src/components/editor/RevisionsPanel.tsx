"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PublicBlocks } from "@/components/public/PublicBlocks";
import { BaseBlock } from "@/types";

interface Rev {
  id: string;
  title: string;
  content: string;
  manual: boolean;
  createdAt: string;
}

interface Props {
  pageId: string;
  /** Changes after each save so the list reloads instead of going stale. */
  refreshKey?: number;
  onRestore?: () => void;
}

export function RevisionsPanel({ pageId, refreshKey = 0, onRestore }: Props) {
  const [revs, setRevs] = useState<Rev[]>([]);
  const [previewing, setPreviewing] = useState<Rev | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pages/${pageId}/revisions`)
      .then((r) => r.json())
      .then(setRevs)
      .catch(() => {});
  }, [pageId, refreshKey]);

  async function restore(revId: string) {
    setRestoring(revId);
    try {
      await fetch(`/api/pages/${pageId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: revId }),
      });
      setPreviewing(null);
      onRestore?.();
    } finally {
      setRestoring(null);
    }
  }

  let previewBlocks: BaseBlock[] | null = null;
  if (previewing) {
    try {
      const parsed = JSON.parse(previewing.content);
      if (Array.isArray(parsed)) previewBlocks = parsed;
    } catch {
      previewBlocks = null;
    }
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold mb-3">Revisions</div>
      {revs.length === 0 ? (
        <div className="text-xs text-fg-muted">No revisions yet. One is kept each time you save, and autosaves within five minutes of each other share one.</div>
      ) : (
        <div className="space-y-2">
          {revs.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-bg-border bg-bg p-2 text-xs">
              <div className="min-w-0">
                <div className="text-fg truncate">
                  {r.title}
                  {r.manual ? <span className="ml-1.5 text-[10px] text-brand uppercase tracking-wide">saved</span> : null}
                </div>
                <div className="text-fg-subtle">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPreviewing(r)} className="shrink-0">
                Preview
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!previewing}
        onClose={() => setPreviewing(null)}
        title={previewing?.title || "Revision"}
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
              Restore this revision
            </Button>
          </>
        }
      >
        <div className="p-4 text-xs text-fg-muted border-b border-bg-border bg-bg-soft">
          This is a read-only preview. Restoring will replace the page&apos;s current content — your unsaved changes, if any, will be lost.
        </div>
        {/*
          The revision is drawn as the published page, links and all, and
          following one walked out of the editor with whatever had not been
          saved — the very state the warning above is about. The canvas
          cancels its links for the same reason; a slider still moves, since
          it scrolls itself by hand when its link has been cancelled.
        */}
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
              <div className="p-6 text-sm text-fg-muted">This revision has no content.</div>
            )
          ) : (
            <div className="p-6 text-sm text-fg-muted">Preview unavailable for this revision.</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
