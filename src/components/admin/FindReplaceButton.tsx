"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { FindResult } from "@/lib/find-replace";

interface Found {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  results: FindResult[];
  total: number;
  truncated: boolean;
  legal: { pageId: string; title: string; count: number }[];
}

/**
 * Find and replace across the whole site; see `lib/find-replace`.
 *
 * Every place is listed before anything changes, each with the words either
 * side of it and ticked to begin with, so a replace of "Ltd" that would also
 * have caught "Ltd." in somebody's quoted testimonial can be told apart and
 * left. What is replaced is what was found by the search shown, not whatever
 * the box says by the time the button is pressed.
 */
export function FindReplaceButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"find" | "replace" | null>(null);
  const [message, setMessage] = useState("");

  async function search(opts: { query: string; matchCase: boolean; wholeWord: boolean }, keepMessage = false) {
    if (!opts.query) return;
    setBusy("find");
    if (!keepMessage) setMessage("");
    try {
      const res = await fetch(`/api/sites/${siteId}/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setFound(null);
        setMessage(body?.error ?? "The search could not be run. Try again.");
        return;
      }
      setFound({ ...opts, ...body });
      setChosen(new Set((body.results as FindResult[]).map((r) => r.key)));
    } finally {
      setBusy(null);
    }
  }

  async function replace() {
    if (!found || chosen.size === 0) return;
    setBusy("replace");
    try {
      const res = await fetch(`/api/sites/${siteId}/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: found.query,
          matchCase: found.matchCase,
          wholeWord: found.wholeWord,
          replace: replacement,
          keys: [...chosen],
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setMessage(body?.error ?? "Nothing was replaced. Try again.");
        return;
      }
      setMessage(doneMessage(body, found.query));
      router.refresh();
    } finally {
      setBusy(null);
    }
    // What is left: the places not chosen, and anything the replacement put back.
    await search({ query: found.query, matchCase: found.matchCase, wholeWord: found.wholeWord }, true);
  }

  const groups = useMemo(() => {
    const out: { title: string; pageId: string | null; results: FindResult[] }[] = [];
    for (const r of found?.results ?? []) {
      const last = out[out.length - 1];
      if (last && last.pageId === r.pageId) last.results.push(r);
      else out.push({ title: r.pageTitle ?? "On every page", pageId: r.pageId, results: [r] });
    }
    return out;
  }, [found]);

  const chosenCount = (found?.results ?? []).filter((r) => chosen.has(r.key)).reduce((n, r) => n + r.count, 0);
  const allChosen = !!found && found.results.length > 0 && found.results.every((r) => chosen.has(r.key));

  function toggle(key: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Find and replace</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Find and replace"
        subtitle="Across every page, the menu, the footer and the site's settings."
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="text-xs text-fg-muted">
              {found && found.results.length > 0 ? (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-fg"
                  onClick={() => setChosen(allChosen ? new Set() : new Set(found.results.map((r) => r.key)))}
                >
                  {allChosen ? "Choose none" : "Choose all"}
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
              {/* An empty replacement takes the words out, which is worth looking different from changing them. */}
              <Button
                variant={replacement ? "primary" : "danger"}
                onClick={replace}
                disabled={!found || chosenCount === 0 || busy !== null}
                loading={busy === "replace"}
              >
                {chosenCount === 0
                  ? "Replace"
                  : `${replacement ? "Replace" : "Remove"} ${chosenCount === 1 ? "1 time" : `${chosenCount} times`}`}
              </Button>
            </div>
          </div>
        }
      >
        <div className="p-5 space-y-4">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              search({ query, matchCase, wholeWord });
            }}
          >
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input aria-label="Find" placeholder="01234 567890" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} autoFocus />
              <Button type="submit" variant="outline" loading={busy === "find"} disabled={!query}>Find</Button>
              <Input aria-label="Replace with" placeholder="Replace with" value={replacement} maxLength={1000} onChange={(e) => setReplacement(e.target.value)} />
            </div>
            <div className="flex gap-4 text-sm text-fg-muted">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
                Match case
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
                Whole words only
              </label>
            </div>
            <p className="text-[11px] text-fg-subtle">
              Words are changed, not the formatting around them. A phone number or email address is changed in the links to it
              as well. Every page changed is kept as a version first; the menu, footer and settings are not.
            </p>
          </form>

          {message ? <p role="status" className="text-sm text-fg">{message}</p> : null}

          {found && busy !== "find" ? (
            found.results.length === 0 ? (
              <p className="text-sm text-fg-muted" data-find-empty="">
                “{found.query}” is not anywhere on the site{found.legal.length ? " that can be changed from here" : ""}.
              </p>
            ) : (
              <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1" data-find-results="">
                <p className="text-xs text-fg-muted">
                  {found.total === 1 ? "Found once" : `Found ${found.total} times`} in {found.results.length === 1 ? "one place" : `${found.results.length} places`}.
                  {found.truncated ? " Only the first 500 places are shown; replace these and search again for the rest." : ""}
                </p>
                {groups.map((group) => (
                  <section key={group.pageId ?? "site"} aria-label={group.title}>
                    <h3 className="text-sm font-semibold mb-1.5">{group.title}</h3>
                    <ul className="space-y-1">
                      {group.results.map((r) => (
                        <li key={r.key} className="flex items-start gap-2 text-sm" data-find-result={r.key}>
                          <input
                            type="checkbox"
                            className="mt-1"
                            aria-label={`Replace in ${r.label}${r.pageTitle ? ` on ${r.pageTitle}` : ""}`}
                            checked={chosen.has(r.key)}
                            onChange={(e) => toggle(r.key, e.target.checked)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-fg-subtle">
                              {r.label}
                              {r.count > 1 ? ` · ${r.count} times` : ""}
                              {r.synced ? " · synced, so on every page that has it" : ""}
                            </div>
                            <div className="text-fg-muted break-words">
                              {r.snippet.before}
                              <mark className="bg-amber-400/30 text-fg rounded-sm px-0.5">{r.snippet.match}</mark>
                              {r.snippet.after}
                            </div>
                          </div>
                          {r.pageId && r.key.includes(":block:") ? (
                            <a
                              href={`/admin/sites/${siteId}/pages/${r.pageId}?block=${encodeURIComponent(r.key.split(":block:")[1])}`}
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

          {found && found.legal.length > 0 && busy !== "find" ? (
            <p className="text-xs text-fg-muted" data-find-legal="">
              Also on {found.legal.map((l) => l.title).join(", ")}, which {found.legal.length === 1 ? "is" : "are"} written from the
              legal details. Change it there and {found.legal.length === 1 ? "it follows" : "they follow"}.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function doneMessage(body: { replaced: number; pages: number; site: boolean; failed: string[] }, query: string): string {
  if (!body.replaced) return "Nothing was replaced: the places chosen no longer have it.";
  const where = [
    body.pages ? `on ${body.pages === 1 ? "one page" : `${body.pages} pages`}` : "",
    body.site ? "in the site's menu, footer or settings" : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const kept = body.pages ? ` Each page was kept as a version named “Before replacing “${query}”” first.` : "";
  const failed = body.failed.length ? ` ${body.failed.join(", ")} could not be changed.` : "";
  return `Replaced ${body.replaced === 1 ? "once" : `${body.replaced} times`} ${where}.${kept}${failed}`;
}
