"use client";
import { useState } from "react";
import { Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { builderLanguageName, COMMON_LANGUAGES, sameLanguage } from "@/lib/translations";
import type { TranslationState } from "@/lib/translations-store";

const SELECT =
  "h-9 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:border-brand/60";

/**
 * The page's language, and the same page in the site's other languages.
 *
 * A translation is made here as a draft copy of the page, joined to it, which
 * is the order the work is done in: the words are already laid out, and what
 * is left is to write them again in the other language. A page that already
 * exists can be joined instead, and any can be taken out.
 */
export function TranslationsPanel({
  pageId,
  siteId,
  initial,
  language,
  onLanguageChange,
}: {
  pageId: string;
  siteId: string;
  initial: TranslationState;
  /** The page's own language, as the settings hold it: empty for the site's. */
  language: string;
  onLanguageChange: (next: string) => void;
}) {
  const [state, setState] = useState(initial);
  const [target, setTarget] = useState("");
  const [existing, setExisting] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; open?: string } | null>(null);

  const own = language || state.siteLanguage;
  const others = state.group.filter((p) => p.id !== pageId);
  // Every language offered by name, the site's own and any already in use
  // among them, less the ones this page's group already has.
  const offered = [...COMMON_LANGUAGES.map((l) => l.code), state.siteLanguage, ...state.candidates.map((c) => c.language)]
    .filter((code, i, all) => all.findIndex((c) => sameLanguage(c, code)) === i)
    .filter((code) => !sameLanguage(code, own) && !others.some((p) => sameLanguage(p.language, code)));
  const linkable = state.candidates.filter((c) => !sameLanguage(c.language, own));

  async function send(method: "POST" | "DELETE", body?: Record<string, string>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/pages/${pageId}/translations`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const answer = await res.json().catch(() => null);
      if (!res.ok || !answer?.group) {
        setMessage({ text: answer?.error ?? "That did not work. Try again." });
        return null;
      }
      setState({ siteLanguage: answer.siteLanguage, group: answer.group, candidates: answer.candidates });
      return answer as TranslationState & { createdId?: string };
    } finally {
      setBusy(false);
    }
  }

  async function translate() {
    if (!target) return;
    const answer = await send("POST", { language: target });
    if (answer?.createdId) {
      setMessage({ text: `A ${builderLanguageName(target)} draft is ready to translate.`, open: answer.createdId });
      setTarget("");
    }
  }

  async function link() {
    if (!existing) return;
    if (await send("POST", { pageId: existing })) setExisting("");
  }

  return (
    <div className="mb-5 pb-5 border-b border-bg-border space-y-3" data-translations="">
      <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold">Language</div>
      <div>
        <Label htmlFor="page-language">This page is written in</Label>
        <select
          id="page-language"
          className={SELECT}
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
        >
          <option value="">The site&apos;s language ({builderLanguageName(state.siteLanguage)})</option>
          {[...COMMON_LANGUAGES.map((l) => l.code), ...(language && !COMMON_LANGUAGES.some((l) => l.code === language) ? [language] : [])]
            .filter((code) => !sameLanguage(code, state.siteLanguage) || code === language)
            .map((code) => (
              <option key={code} value={code}>{builderLanguageName(code)}</option>
            ))}
        </select>
      </div>

      {others.length > 0 ? (
        <div>
          <div className="text-xs text-fg-muted mb-1">The same page in</div>
          <ul className="space-y-1" aria-label="Translations">
            {others.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-fg-muted">{builderLanguageName(p.language)}</span>
                <a href={`/admin/sites/${siteId}/pages/${p.id}`} className="flex-1 min-w-0 truncate underline underline-offset-2 hover:text-fg">
                  {p.title}
                </a>
                {p.published ? null : <span className="shrink-0 text-fg-subtle">draft</span>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => send("DELETE")}
            disabled={busy}
            className="mt-2 text-xs text-fg-muted hover:text-fg underline disabled:opacity-40"
          >
            This page is not a translation of these
          </button>
        </div>
      ) : null}

      <div>
        <Label htmlFor="translate-into">Translate into</Label>
        <div className="flex gap-2">
          <select id="translate-into" className={SELECT} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose a language</option>
            {offered.map((code) => (
              <option key={code} value={code}>{builderLanguageName(code)}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={translate} disabled={!target || busy} className="shrink-0">
            Make a copy
          </Button>
        </div>
        <p className="text-xs text-fg-subtle mt-1">A draft copy of this page as last saved, to write in that language, linked to this one.</p>
      </div>

      {linkable.length > 0 ? (
        <div>
          <Label htmlFor="translation-existing">Or it is already written</Label>
          <div className="flex gap-2">
            <select id="translation-existing" className={SELECT} value={existing} onChange={(e) => setExisting(e.target.value)}>
              <option value="">Choose a page</option>
              {linkable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({builderLanguageName(c.language)})
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={link} disabled={!existing || busy} className="shrink-0">
              Link
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="text-xs text-fg-muted">
          {message.text}{" "}
          {message.open ? (
            <a href={`/admin/sites/${siteId}/pages/${message.open}`} className="underline underline-offset-2 hover:text-fg">
              Open it
            </a>
          ) : null}
        </p>
      ) : null}
      <p className="text-xs text-fg-subtle">
        Visitors get a switcher in the header to the same page in each language, and search engines are told which page is
        which.
      </p>
    </div>
  );
}
