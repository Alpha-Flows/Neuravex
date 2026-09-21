"use client";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Submission {
  id: string;
  data: string;
  createdAt: string;
}

/** One screen's worth, matching the API's default. */
const PAGE_SIZE = 100;

/**
 * What visitors have sent, and what the operator can do about it.
 *
 * The viewer used to ask for the newest hundred and say nothing about the
 * rest, so a form with more answers than that quietly showed a slice — which
 * also hid a page being filled with junk. And there was no way to delete an
 * answer or get one out of the app, while the Datenschutzerklärung the
 * builder generates promises the visitor erasure on request and prints a
 * retention period.
 */
export function SubmissionsViewer({ siteId }: { siteId: string }) {
  const [pages, setPages] = useState<{ id: string; title: string; slug: string }[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/pages?all=1`)
      .then((r) => r.json())
      .then((ps) =>
        setPages(
          Array.isArray(ps)
            ? ps.map((p: { id: string; title: string; slug: string }) => ({ id: p.id, title: p.title, slug: p.slug }))
            : [],
        ),
      )
      .catch(() => {});
  }, [siteId]);

  const load = useCallback(
    (pageId: string, offset: number) => {
      setLoading(true);
      fetch(`/api/pages/${pageId}/submissions?skip=${offset}&take=${PAGE_SIZE}`)
        .then((r) => r.json())
        .then((body) => {
          setSubs(Array.isArray(body?.submissions) ? body.submissions : []);
          setTotal(Number(body?.total) || 0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    if (!selectedPage) {
      setSubs([]);
      setTotal(0);
      setSkip(0);
      return;
    }
    load(selectedPage, skip);
  }, [selectedPage, skip, load]);

  async function removeOne(id: string) {
    if (!confirm("Delete this submission? This cannot be undone.")) return;
    await fetch(`/api/submissions/${id}`, { method: "DELETE" });
    if (selectedPage) load(selectedPage, skip);
  }

  async function removeAll() {
    if (!selectedPage) return;
    if (!confirm(`Delete all ${total} submissions on this page? This cannot be undone.`)) return;
    await fetch(`/api/submissions?pageId=${encodeURIComponent(selectedPage)}`, { method: "DELETE" });
    setSkip(0);
    load(selectedPage, 0);
  }

  async function removeOlderThan(days: number) {
    if (!selectedPage) return;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (!confirm(`Delete every submission older than ${days} days? This cannot be undone.`)) return;
    await fetch(
      `/api/submissions?pageId=${encodeURIComponent(selectedPage)}&before=${encodeURIComponent(cutoff.toISOString())}`,
      { method: "DELETE" },
    );
    setSkip(0);
    load(selectedPage, 0);
  }

  const shown = subs.length;
  const from = total === 0 ? 0 : skip + 1;
  const to = skip + shown;

  return (
    <div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-fg-muted mb-1 uppercase tracking-wide">Page</label>
        <select
          value={selectedPage ?? ""}
          onChange={(e) => {
            setSkip(0);
            setSelectedPage(e.target.value || null);
          }}
          className="h-9 w-full max-w-xs px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:border-brand/60"
        >
          <option value="">Select a page</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>{p.title} ({p.slug})</option>
          ))}
        </select>
      </div>

      {selectedPage && total > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted">
            {from}–{to} of {total}
          </span>
          <span className="flex-1" />
          <a
            href={`/api/pages/${selectedPage}/submissions?format=csv`}
            className="h-8 px-3 inline-flex items-center rounded-md border border-bg-border text-fg-muted hover:text-fg text-xs"
            download
          >
            Export CSV
          </a>
          <Button className="h-8 px-3 text-xs" onClick={() => removeOlderThan(90)}>
            Delete older than 90 days
          </Button>
          <Button className="h-8 px-3 text-xs" onClick={removeAll}>
            Delete all
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-fg-muted py-4">Loading…</div>
      ) : !selectedPage ? (
        <div className="text-sm text-fg-muted py-4">Choose a page to view its form submissions.</div>
      ) : subs.length === 0 ? (
        <div className="text-sm text-fg-muted py-4">No submissions yet.</div>
      ) : (
        <>
          <div className="space-y-3">
            {subs.map((s) => (
              <Card key={s.id} className="p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="text-xs text-fg-muted">{new Date(s.createdAt).toLocaleString()}</div>
                  <button
                    type="button"
                    onClick={() => removeOne(s.id)}
                    className="text-xs text-fg-subtle hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
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

          {total > PAGE_SIZE ? (
            <div className="mt-4 flex items-center gap-2">
              <Button
                className="h-8 px-3 text-xs"
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
              >
                ← Newer
              </Button>
              <Button
                className="h-8 px-3 text-xs"
                disabled={to >= total}
                onClick={() => setSkip(skip + PAGE_SIZE)}
              >
                Older →
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
