"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function SubmissionsViewer({ siteId }: { siteId: string }) {
  const [pages, setPages] = useState<{ id: string; title: string; slug: string }[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [subs, setSubs] = useState<{ id: string; data: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/pages?all=1`)
      .then((r) => r.json())
      .then((ps) => setPages(ps.map((p: any) => ({ id: p.id, title: p.title, slug: p.slug }))))
      .catch(() => {});
  }, [siteId]);

  useEffect(() => {
    if (!selectedPage) { setSubs([]); return; }
    setLoading(true);
    fetch(`/api/pages/${selectedPage}/submissions`)
      .then((r) => r.json())
      .then((s) => setSubs(Array.isArray(s) ? s : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedPage]);

  return (
    <div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-fg-muted mb-1 uppercase tracking-wide">Page</label>
        <select
          value={selectedPage ?? ""}
          onChange={(e) => setSelectedPage(e.target.value || null)}
          className="h-9 w-full max-w-xs px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:border-brand/60"
        >
          <option value="">Select a page</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>{p.title} ({p.slug})</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="text-sm text-fg-muted py-4">Loading…</div>
      ) : !selectedPage ? (
        <div className="text-sm text-fg-muted py-4">Choose a page to view its form submissions.</div>
      ) : subs.length === 0 ? (
        <div className="text-sm text-fg-muted py-4">No submissions yet.</div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <Card key={s.id} className="p-3">
              <div className="text-xs text-fg-muted mb-2">{new Date(s.createdAt).toLocaleString()}</div>
              <div className="space-y-1 text-sm">
                {(() => {
                  try {
                    const d = JSON.parse(s.data);
                    return Object.entries(d).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-fg-muted font-medium">{k}:</span>
                        <span>{String(v)}</span>
                      </div>
                    ));
                  } catch {
                    return <span className="text-fg-muted">Invalid data</span>;
                  }
                })()}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
