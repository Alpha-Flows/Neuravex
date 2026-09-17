"use client";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface PickedImage {
  /** The picture's own pixel size, when it could be read. */
  naturalWidth?: number;
  naturalHeight?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * The chosen picture, with its size when we know it. The size is what lets a
   * page reserve the right space instead of jumping as the image arrives.
   */
  onSelect: (url: string, size?: PickedImage) => void;
}

/** Ask the browser how big a picture is, without waiting forever for an answer. */
function measure(url: string): Promise<PickedImage> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve({});
    const img = new window.Image();
    const done = (size: PickedImage) => resolve(size);
    const timer = setTimeout(() => done({}), 4000);
    img.onload = () => {
      clearTimeout(timer);
      done(
        img.naturalWidth && img.naturalHeight
          ? { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }
          : {},
      );
    };
    img.onerror = () => { clearTimeout(timer); done({}); };
    img.src = url;
  });
}

interface StockPhoto {
  id: string;
  url: string;
  alt: string;
  category: string;
  credit?: string;
  creditUrl?: string;
  license?: string;
}

export function MediaPicker({ open, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<"uploads" | "stock">("uploads");
  const [files, setFiles] = useState<{ url: string; name: string; usedOn?: string[] }[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [stockPhotos, setStockPhotos] = useState<StockPhoto[]>([]);
  const [stockCategories, setStockCategories] = useState<string[]>([]);
  const [stockLoaded, setStockLoaded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/media").then((r) => r.json()).then(setFiles).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "stock" || stockLoaded) return;
    fetch("/api/stock")
      .then((r) => r.json())
      .then((data) => {
        setStockPhotos(data.photos ?? []);
        setStockCategories(data.categories ?? []);
        setStockLoaded(true);
      })
      .catch(() => setStockLoaded(true));
  }, [open, tab, stockLoaded]);

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
        onSelect(info.url, { naturalWidth: info.width, naturalHeight: info.height });
        onClose();
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(url: string) {
    // Deleting a file that pages point at leaves broken images behind, so say
    // where it is used before it goes.
    const used = files.find((f) => f.url === url)?.usedOn ?? [];
    if (used.length > 0) {
      const names = used.slice(0, 5).join(", ");
      const more = used.length > 5 ? ` and ${used.length - 5} more` : "";
      const ok = confirm(
        `This image is used on ${used.length} page${used.length === 1 ? "" : "s"}: ${names}${more}.\n\n` +
          "Deleting it will leave those pages with a broken image. Delete anyway?",
      );
      if (!ok) return;
    }
    await fetch("/api/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    setFiles((f) => f.filter((x) => x.url !== url));
  }

  if (!open) return null;

  const visibleStockPhotos = activeCategory
    ? stockPhotos.filter((p) => p.category === activeCategory)
    : stockPhotos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-bg-border bg-bg-soft p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 rounded-lg bg-bg p-1 border border-bg-border">
            <button
              onClick={() => setTab("uploads")}
              className={cn("px-3 h-7 rounded-md text-xs font-medium", tab === "uploads" ? "bg-brand text-white" : "text-fg-muted hover:text-fg")}
            >
              Uploads
            </button>
            <button
              onClick={() => setTab("stock")}
              className={cn("px-3 h-7 rounded-md text-xs font-medium", tab === "stock" ? "bg-brand text-white" : "text-fg-muted hover:text-fg")}
            >
              Stock photos
            </button>
          </div>
          <div className="flex items-center gap-2">
            {tab === "uploads" ? (
              <>
                <input ref={inputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} loading={uploading}>
                  Upload
                </Button>
              </>
            ) : null}
            <button onClick={onClose} className="text-fg-muted hover:text-fg">×</button>
          </div>
        </div>

        {tab === "uploads" ? (
          files.length === 0 ? (
            <div className="text-sm text-fg-muted text-center py-8">No images yet. Upload one to get started.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
              {files.map((f) => (
                <div key={f.url} className="group relative rounded-lg overflow-hidden border border-bg-border bg-bg cursor-pointer" onClick={async () => { const size = await measure(f.url); onSelect(f.url, size); onClose(); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.name} className="w-full h-24 object-cover" />
                  {f.usedOn && f.usedOn.length > 0 ? (
                    <span
                      className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/65 text-[10px] text-white"
                      title={`Used on: ${f.usedOn.join(", ")}`}
                    >
                      in use
                    </span>
                  ) : null}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(f.url); }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  >×</button>
                </div>
              ))}
            </div>
          )
        ) : !stockLoaded ? (
          <div className="text-sm text-fg-muted text-center py-8">Loading…</div>
        ) : stockPhotos.length === 0 ? (
          <div className="text-sm text-fg-muted text-center py-8">
            No stock photos in the library yet.
            <br />
            Use the Uploads tab to add your own image.
          </div>
        ) : (
          <>
            {stockCategories.length > 1 ? (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={cn("px-2.5 h-6 rounded-full text-xs capitalize", activeCategory === null ? "bg-brand text-white" : "bg-bg border border-bg-border text-fg-muted hover:text-fg")}
                >
                  All
                </button>
                {stockCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={cn("px-2.5 h-6 rounded-full text-xs capitalize", activeCategory === c ? "bg-brand text-white" : "bg-bg border border-bg-border text-fg-muted hover:text-fg")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
              {visibleStockPhotos.map((p) => (
                <div
                  key={p.id}
                  className="group relative rounded-lg overflow-hidden border border-bg-border bg-bg cursor-pointer"
                  onClick={async () => { const size = await measure(p.url); onSelect(p.url, size); onClose(); }}
                  title={p.credit ? `Photo by ${p.credit}${p.license ? ` — ${p.license}` : ""}` : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.alt} className="w-full h-24 object-cover" />
                  {p.credit ? (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-white truncate block">{p.credit}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
