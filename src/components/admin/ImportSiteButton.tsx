"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { importSiteFile } from "@/lib/site-import";

/**
 * Brings a site back from a backup, or from a JSON export: see
 * `importSiteFile`. The import route had been there all along, with no way to
 * reach it short of a terminal.
 */
export function ImportSiteButton() {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function chosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Emptied, so choosing the same file again after an error is a change.
    e.target.value = "";
    if (!file) return;
    setError("");
    setProgress("Reading the file…");
    try {
      const result = await importSiteFile(file, setProgress);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Files that would not come back are named on the site's page, where
      // the pictures they leave empty are.
      const note = result.missing.length ? `?missing=${encodeURIComponent(result.missing.slice(0, 20).join("\n"))}` : "";
      router.push(`/admin/sites/${result.site.id}${note}`);
    } finally {
      setProgress("");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        onChange={chosen}
        className="hidden"
        aria-label="Site backup or export"
      />
      <Button
        variant="outline"
        onClick={() => input.current?.click()}
        loading={!!progress}
        title="A backup made with “Back up”, or a JSON export"
      >
        Import a site
      </Button>
      {progress ? <span role="status" className="text-xs text-fg-muted">{progress}</span> : null}
      {error ? <span role="alert" className="text-xs text-red-400 max-w-xs text-right">{error}</span> : null}
    </div>
  );
}
