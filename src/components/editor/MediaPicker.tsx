"use client";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { matchesQuery } from "@/lib/media";
import { Overlay } from "@/components/ui/Overlay";

export interface PickedImage {
  /** The picture's own pixel size, when it could be read. */
  naturalWidth?: number;
  naturalHeight?: number;
  /**
   * What the picture shows, where the library knows. The bundled photographs
   * each carry a description; it used to stay in this dialog, so a picture
   * chosen here landed on the page with nothing for a screen reader to read.
   */
  alt?: string;
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

interface UploadedFile {
  url: string;
  name: string;
  alt?: string;
  usedOn?: string[];
}

export function MediaPicker({ open, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<"uploads" | "stock">("uploads");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** What was typed in the search box, for whichever tab is showing. */
  const [query, setQuery] = useState("");
  /** The upload whose name and description are being edited, if any. */
  const [editing, setEditing] = useState<UploadedFile | null>(null);
  /** The one just saved, kept on screen even if the search no longer fits it. */
  const [justEdited, setJustEdited] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftAlt, setDraftAlt] = useState("");
  const [saving, setSaving] = useState(false);

  const [stockPhotos, setStockPhotos] = useState<StockPhoto[]>([]);
  const [stockCategories, setStockCategories] = useState<string[]>([]);
  const [stockLoaded, setStockLoaded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setEditing(null);
    setJustEdited(null);
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
        setFiles((f) => [...f, { url: info.url, name: info.name, alt: "" }]);
        onSelect(info.url, { naturalWidth: info.width, naturalHeight: info.height });
        onClose();
      }
    } finally {
      setUploading(false);
    }
  }

  function startEditing(file: UploadedFile) {
    setEditing(file);
    setDraftName(file.name);
    setDraftAlt(file.alt ?? "");
  }

  async function saveEdits() {
    if (!editing || !draftName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: editing.url, name: draftName, alt: draftAlt }),
      });
      if (!res.ok) return;
      const saved = await res.json();
      setFiles((f) => f.map((x) => (x.url === saved.url ? { ...x, name: saved.name, alt: saved.alt } : x)));
      // Renaming a picture can take it out of the search that found it. The
      // one just edited stays where it is rather than vanishing as it is
      // saved; the next search puts it back under the ordinary rules.
      setJustEdited(saved.url);
      setEditing(null);
    } finally {
      setSaving(false);
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
    setEditing((e) => (e?.url === url ? null : e));
  }

  if (!open) return null;

  const visibleFiles = files.filter((f) => f.url === justEdited || matchesQuery(query, [f.name, f.alt]));
  const visibleStockPhotos = (activeCategory ? stockPhotos.filter((p) => p.category === activeCategory) : stockPhotos)
    .filter((p) => matchesQuery(query, [p.alt, p.category, p.credit]));

  return (
    // Drawn on the body: a dialog written inside a block would otherwise be
    // held inside that block's layer, and open underneath the site header.
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        {/* A dialog, and named as one. It is the handle a screen reader — and a
            test — has on this, now that it is drawn on the body rather than
            inside the block whose picture it is choosing. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pictures"
          className="w-full max-w-lg rounded-xl border border-bg-border bg-bg-soft p-6"
          onClick={(e) => e.stopPropagation()}
        >
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

          {/* A library you cannot search is a library you scroll. */}
          <div className="mb-3">
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setJustEdited(null); }}
              placeholder={tab === "uploads" ? "Search your pictures…" : "Search the photographs…"}
              aria-label="Search pictures"
            />
          </div>

          {tab === "uploads" ? (
            files.length === 0 ? (
              <div className="text-sm text-fg-muted text-center py-8">No images yet. Upload one to get started.</div>
            ) : visibleFiles.length === 0 ? (
              <div className="text-sm text-fg-muted text-center py-8">
                Nothing here matches “{query}”.
                <br />
                A picture answers to its name and to what it shows.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                  {visibleFiles.map((f) => (
                    <div key={f.url} className="group relative rounded-lg overflow-hidden border border-bg-border bg-bg">
                      <div className="cursor-pointer" onClick={async () => { const size = await measure(f.url); onSelect(f.url, { ...size, alt: f.alt || undefined }); onClose(); }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.alt || f.name} className="w-full h-24 object-cover" />
                        {/* The name a person gave it, not the one the disk did. */}
                        <div className="px-1.5 py-1 text-[11px] text-fg-muted truncate" title={f.alt ? `${f.name} — ${f.alt}` : f.name}>
                          {f.name}
                        </div>
                      </div>
                      {f.usedOn && f.usedOn.length > 0 ? (
                        <span
                          className="absolute bottom-6 left-1 px-1.5 py-0.5 rounded bg-black/65 text-[10px] text-white"
                          title={`Used on: ${f.usedOn.join(", ")}`}
                        >
                          in use
                        </span>
                      ) : null}
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          aria-label={`Edit ${f.name}`}
                          title="Rename, or say what it shows"
                          onClick={(e) => { e.stopPropagation(); startEditing(f); }}
                          className="w-5 h-5 rounded-full bg-black/50 text-white text-[10px] flex items-center justify-center"
                        >✎</button>
                        <button
                          aria-label={`Delete ${f.name}`}
                          onClick={(e) => { e.stopPropagation(); handleDelete(f.url); }}
                          className="w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
                        >×</button>
                      </div>
                    </div>
                  ))}
                </div>

                {editing ? (
                  <div className="mt-3 rounded-lg border border-bg-border bg-bg p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editing.url} alt="" className="w-12 h-12 rounded object-cover border border-bg-border" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg">Editing this picture</p>
                        <p className="text-[11px] text-fg-muted truncate">
                          {editing.usedOn && editing.usedOn.length > 0
                            ? `Used on ${editing.usedOn.join(", ")}. Its address does not change.`
                            : "Not used on any page yet."}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="media-name">Name</Label>
                      <Input
                        id="media-name"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveEdits(); } }}
                        placeholder="Hero — sunset over the bay"
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor="media-alt">What it shows</Label>
                      <Input
                        id="media-alt"
                        value={draftAlt}
                        onChange={(e) => setDraftAlt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveEdits(); } }}
                        placeholder="A harbour at dusk, with boats moored in the foreground"
                      />
                      <p className="text-[11px] text-fg-subtle mt-1">
                        Travels with the picture onto the page, for a reader who cannot see it.
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      <Button size="sm" onClick={saveEdits} loading={saving} disabled={!draftName.trim()}>Save</Button>
                    </div>
                  </div>
                ) : null}
              </>
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
              {visibleStockPhotos.length === 0 ? (
                <div className="text-sm text-fg-muted text-center py-8">
                  No photograph here matches “{query}”.
                </div>
              ) : null}
              <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                {visibleStockPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="group relative rounded-lg overflow-hidden border border-bg-border bg-bg cursor-pointer"
                    onClick={async () => { const size = await measure(p.url); onSelect(p.url, { ...size, alt: p.alt }); onClose(); }}
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
    </Overlay>
  );
}
