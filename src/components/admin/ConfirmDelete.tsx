"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface DeletionCost {
  pages: number;
  revisions: number;
  submissions: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** "site" or "page" — what is being deleted. */
  kind: "site" | "page";
  name: string;
  /** Where to ask what this would take with it. */
  costUrl: string;
  onConfirm: () => Promise<void> | void;
  /** Offered before deleting a site, so there is a copy either way. */
  backupUrl?: string;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Says what a deletion takes with it, before it happens.
 *
 * A browser confirm() said "this cannot be undone" and nothing else — not how
 * many pages were attached, nor that the form submissions people had sent went
 * with them. Now it counts them, and deleting moves the whole thing to the
 * trash where it can be put back.
 */
export function ConfirmDelete({ open, onClose, kind, name, costUrl, onConfirm, backupUrl }: Props) {
  const [cost, setCost] = useState<DeletionCost | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) { setCost(null); setFailed(false); return; }
    let live = true;
    fetch(costUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setCost({ pages: d.pages ?? 0, revisions: d.revisions ?? 0, submissions: d.submissions ?? 0 }); })
      .catch(() => {});
    return () => { live = false; };
  }, [open, costUrl]);

  async function confirm() {
    setWorking(true);
    setFailed(false);
    try {
      await onConfirm();
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  const goesWith: string[] = [];
  if (cost) {
    if (kind === "site") goesWith.push(count(cost.pages, "page"));
    if (cost.revisions > 0) goesWith.push(count(cost.revisions, "saved version"));
    if (cost.submissions > 0) goesWith.push(count(cost.submissions, "form submission"));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "site" ? `Delete "${name}"?` : `Delete the page "${name}"?`}
      subtitle="It goes to the trash, where you can put it back."
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={confirm} loading={working}>
            {kind === "site" ? "Delete site" : "Delete page"}
          </Button>
        </>
      }
    >
      <div className="p-5 space-y-3 text-sm">
        {cost === null ? (
          <p className="text-fg-muted">Checking what this would take with it…</p>
        ) : goesWith.length > 0 ? (
          <p className="text-fg-muted">
            This takes {goesWith.join(", ").replace(/, ([^,]*)$/, " and $1")} with it.
          </p>
        ) : (
          <p className="text-fg-muted">
            {kind === "site" ? "This site has no pages yet." : "Nothing else is attached to this page."}
          </p>
        )}

        {cost && cost.submissions > 0 ? (
          <p className="text-amber-300/90">
            {count(cost.submissions, "answer")} sent through a form on this {kind} would go too. Nobody else has
            a copy of those.
          </p>
        ) : null}

        {backupUrl ? (
          <p className="text-fg-subtle text-xs">
            Want one outside the app as well?{" "}
            <a href={backupUrl} className="underline hover:text-fg">Download a copy first</a>.
          </p>
        ) : null}

        {failed ? <p className="text-red-400">That didn&apos;t work. Nothing was deleted.</p> : null}
      </div>
    </Modal>
  );
}
