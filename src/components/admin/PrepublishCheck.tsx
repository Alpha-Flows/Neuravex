"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Finding } from "@/lib/prepublish";

interface CheckResult {
  findings: Finding[];
  pages: { id: string; title: string; published: boolean }[];
}

/**
 * The check before publishing, as a list to work through; see
 * `lib/prepublish`. Every finding opens the page it is on with its block
 * selected, so fixing one is a click away rather than a hunt.
 *
 * It is asked for, not run on every visit to the dashboard: reading every
 * page and weighing every picture is work, and a list that is always there is
 * a list nobody reads.
 */
export function PrepublishCheck({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setOpen(true);
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/sites/${siteId}/check`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const problems = result?.findings.filter((f) => f.severity === "problem").length ?? 0;
  const suggestions = (result?.findings.length ?? 0) - problems;
  const groups = result ? groupByPage(result) : [];

  return (
    <>
      <Button variant="outline" onClick={run}>Check the site</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Before publishing"
        subtitle={
          busy
            ? "Reading every page…"
            : failed
              ? "The check could not be run. Try again."
              : result
                ? summary(problems, suggestions)
                : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={run} disabled={busy}>Check again</Button>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        }
      >
        {result && !busy ? (
          groups.length === 0 ? (
            <p className="text-sm text-fg-muted" role="status">
              Every picture is described, every link goes somewhere, and nothing is heavier than it needs to be.
            </p>
          ) : (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1" data-prepublish-results="">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.title}>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    {group.title}
                    {group.draft ? (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-bg-soft text-fg-subtle border border-bg-border">
                        Draft
                      </span>
                    ) : null}
                  </h3>
                  <ul className="space-y-1.5">
                    {group.findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span
                          aria-label={f.severity === "problem" ? "Problem" : "Suggestion"}
                          className={f.severity === "problem" ? "mt-1.5 w-2 h-2 rounded-full bg-amber-400 shrink-0" : "mt-1.5 w-2 h-2 rounded-full border border-fg-subtle shrink-0"}
                        />
                        <span className="flex-1 text-fg-muted">{f.message}</span>
                        {f.pageId ? (
                          <a
                            href={`/admin/sites/${siteId}/pages/${f.pageId}${f.blockId ? `?block=${encodeURIComponent(f.blockId)}` : ""}`}
                            className="shrink-0 text-xs underline underline-offset-2 text-fg-muted hover:text-fg"
                          >
                            Open
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : null}
      </Modal>
    </>
  );
}

function summary(problems: number, suggestions: number): string {
  if (problems === 0 && suggestions === 0) return "Nothing to fix.";
  const parts = [
    problems ? `${problems} ${problems === 1 ? "problem" : "problems"} a visitor will meet` : "",
    suggestions ? `${suggestions} ${suggestions === 1 ? "suggestion" : "suggestions"}` : "",
  ].filter(Boolean);
  return `${parts.join(", and ")}.`;
}

/** The findings under the page each is on, published pages first, the site's own before them all. */
function groupByPage(result: CheckResult) {
  const groups: { key: string; title: string; draft: boolean; findings: Finding[] }[] = [];
  const site = result.findings.filter((f) => f.pageId === null);
  if (site.length) groups.push({ key: "site", title: "The whole site", draft: false, findings: site });
  const ordered = [...result.pages].sort((a, b) => Number(b.published) - Number(a.published));
  for (const page of ordered) {
    const findings = result.findings.filter((f) => f.pageId === page.id);
    if (findings.length === 0) continue;
    // Problems first: they are what a visitor meets.
    findings.sort((a, b) => Number(b.severity === "problem") - Number(a.severity === "problem"));
    groups.push({ key: page.id, title: page.title, draft: !page.published, findings });
  }
  return groups;
}
