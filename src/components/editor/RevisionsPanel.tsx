"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Rev {
  id: string;
  title: string;
  createdAt: string;
}

interface Props {
  pageId: string;
  onRestore?: () => void;
}

export function RevisionsPanel({ pageId, onRestore }: Props) {
  const [revs, setRevs] = useState<Rev[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pages/${pageId}/revisions`)
      .then((r) => r.json())
      .then(setRevs)
      .catch(() => {});
  }, [pageId]);

  async function restore(revId: string) {
    if (!confirm("Restore this revision? Current unsaved changes will be lost.")) return;
    setRestoring(revId);
    try {
      await fetch(`/api/pages/${pageId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: revId }),
      });
      onRestore?.();
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold mb-3">Revisions</div>
      {revs.length === 0 ? (
        <div className="text-xs text-fg-muted">No revisions yet. Revisions are created when you save.</div>
      ) : (
        <div className="space-y-2">
          {revs.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-bg-border bg-bg p-2 text-xs">
              <div>
                <div className="text-fg">{r.title}</div>
                <div className="text-fg-subtle">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => restore(r.id)} loading={restoring === r.id}>
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
