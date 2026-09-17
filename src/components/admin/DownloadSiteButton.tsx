"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Downloads the site as a folder of plain HTML, CSS and images.
 *
 * The request is made from here rather than with a plain link so a failure
 * (nothing published yet, a page that would not render) can be reported
 * instead of the browser quietly saving an error page as a .zip.
 */
export function DownloadSiteButton({ siteId, disabled }: { siteId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/download`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not build the download.");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "site.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not build the download.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={download}
        loading={busy}
        disabled={disabled}
        title={disabled ? "Publish a page first" : "Download this site as HTML, CSS and images"}
      >
        Download files
      </Button>
      {error ? (
        <div className="absolute right-0 top-11 z-20 w-72 rounded-lg border border-red-500/40 bg-bg-card p-3 text-xs text-red-300 shadow-xl">
          {error}
          <button onClick={() => setError(null)} className="block mt-2 text-fg-muted hover:text-fg underline">
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
