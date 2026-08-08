"use client";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function MediaPicker({ open, onClose, onSelect }: Props) {
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/media").then((r) => r.json()).then(setFiles).catch(() => {});
  }, [open]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const info = await res.json();
      if (info.url) {
        setFiles((f) => [...f, { url: info.url, name: info.name }]);
        onSelect(info.url);
        onClose();
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(url: string) {
    await fetch("/api/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    setFiles((f) => f.filter((x) => x.url !== url));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-bg-border bg-bg-soft p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Media library</h3>
          <div className="flex items-center gap-2">
            <input ref={inputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} loading={uploading}>
              Upload
            </Button>
            <button onClick={onClose} className="text-fg-muted hover:text-fg">×</button>
          </div>
        </div>
        {files.length === 0 ? (
          <div className="text-sm text-fg-muted text-center py-8">No images yet. Upload one to get started.</div>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
            {files.map((f) => (
              <div key={f.url} className="group relative rounded-lg overflow-hidden border border-bg-border bg-bg cursor-pointer" onClick={() => { onSelect(f.url); onClose(); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} className="w-full h-24 object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(f.url); }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
