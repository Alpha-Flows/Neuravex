"use client";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { matchesQuery } from "@/lib/media";
import { ACCEPT, extensionList, libraryFor, mediaKindOf, type PickableKind } from "@/lib/media-kind";
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
  /**
   * What is being chosen. Pictures unless a caller says otherwise, so every
   * picker that existed before the audio block behaves exactly as it did.
   */
  kind?: PickableKind;
}

/**
 * The words the dialog uses, per kind.
 *
 * The library was written for pictures and said so in a dozen places — the
 * dialog's name, the search box, the empty state, the delete warning. An
 * audio block that opened it and was told to "upload an image" would be a
 * picker that did not know what it was for, so every one of those sentences
 * is here twice rather than bent into something that fits neither.
 */
const WORDS = {
  image: {
    dialog: "Pictures",
    search: "Search pictures",
    searchPlaceholder: "Search your pictures…",
    empty: "No images yet. Upload one to get started.",
    noMatch: "A picture answers to its name and to what it shows.",
    wrongKind: "That is not a picture. Choose a JPG, PNG, GIF, WebP, AVIF or SVG file.",
    editing: "Editing this picture",
    namePlaceholder: "Hero — sunset over the bay",
    describe: "What it shows",
    describePlaceholder: "A harbour at dusk, with boats moored in the foreground",
    describeHint: "Travels with the picture onto the page, for a reader who cannot see it.",
    thing: "image",
    broken: "a broken image",
  },
  audio: {
    dialog: "Sounds",
    search: "Search sounds",
    searchPlaceholder: "Search your sounds…",
    empty: `No sounds yet. Upload an ${extensionList("audio")} file to get started.`,
    noMatch: "A sound answers to its name and to what it is.",
    wrongKind: `That is not a sound file. Choose an ${extensionList("audio")} file.`,
    editing: "Editing this sound",
    namePlaceholder: "Episode 12 — the long interview",
    describe: "What it is",
    describePlaceholder: "A conversation about starting a bakery, recorded in March",
    describeHint: "Only for finding it here later. The page shows the title and description you give the block.",
    thing: "sound",
    broken: "a player with nothing to play",
  },
} as const;

/** What the delete warning calls a file that is neither a picture nor a sound. */
const OTHER_FILE = { thing: "file", broken: "a reference to a file that is no longer there" } as const;

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

export function MediaPicker({ open, ...rest }: Props) {
  // Closing unmounts the body, which is what clears the search box, the
  // picture being renamed and the loaded list. That used to be done by the
  // effect below, on the way *in* — so the previous session's search term was
  // still there for the frame before it ran.
  if (!open) return null;
  return <MediaPickerBody {...rest} />;
}

function MediaPickerBody({ onClose, onSelect, kind = "image" }: Omit<Props, "open">) {
  const words = WORDS[kind];
  const audio = kind === "audio";
  const [tab, setTab] = useState<"uploads" | "stock">("uploads");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  /** Why the last upload did not become a choice, in the words the server used. */
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    fetch("/api/media").then((r) => r.json()).then(setFiles).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "stock" || stockLoaded) return;
    fetch("/api/stock")
      .then((r) => r.json())
      .then((data) => {
        setStockPhotos(data.photos ?? []);
        setStockCategories(data.categories ?? []);
        setStockLoaded(true);
      })
      .catch(() => setStockLoaded(true));
  }, [tab, stockLoaded]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Emptied so that choosing the same file again, after an error, is still
    // a change the input reports.
    e.target.value = "";
    if (!file) return;

    // `accept` is a suggestion the file dialog's "All files" switch ignores.
    // An MP3 chosen here for an image block used to upload, become the
    // picture, and draw nothing — so a file of the wrong kind is refused
    // before it is sent, rather than stored and then hidden from this list.
    if (mediaKindOf(file.name) !== kind) {
      setUploadError(words.wrongKind);
      return;
    }

    setUploadError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const info = await res.json().catch(() => ({}));
      if (res.ok && info.url) {
        setFiles((f) => [...f, { url: info.url, name: info.name, alt: "" }]);
        onSelect(info.url, { naturalWidth: info.width, naturalHeight: info.height });
        onClose();
      } else {
        // The route says why — too large, contents not matching the name —
        // and that used to go nowhere: the button stopped spinning and nothing
        // else happened. A sound file meets the size cap far sooner than a
        // photograph does, so this is the message people will actually see.
        setUploadError(typeof info.error === "string" ? info.error : "That file could not be uploaded.");
      }
    } catch {
      setUploadError("That file could not be uploaded.");
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
    // where it is used before it goes — in the words for what the file is,
    // which is not always what this picker is choosing.
    const used = files.find((f) => f.url === url)?.usedOn ?? [];
    if (used.length > 0) {
      const own = mediaKindOf(url);
      const { thing, broken } = own === "image" ? WORDS.image : own === "audio" ? WORDS.audio : OTHER_FILE;
      const names = used.slice(0, 5).join(", ");
      const more = used.length > 5 ? ` and ${used.length - 5} more` : "";
      const ok = confirm(
        `This ${thing} is used on ${used.length} page${used.length === 1 ? "" : "s"}: ${names}${more}.\n\n` +
          `Deleting it will leave those pages with ${broken}. Delete anyway?`,
      );
      if (!ok) return;
    }
    await fetch("/api/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    setFiles((f) => f.filter((x) => x.url !== url));
    setEditing((e) => (e?.url === url ? null : e));
  }

  async function pick(file: UploadedFile) {
    // Only a picture has a size worth waiting for; a sound would sit here for
    // the four seconds `measure` allows before giving up on it.
    const size = audio ? {} : await measure(file.url);
    onSelect(file.url, { ...size, alt: file.alt || undefined });
    onClose();
  }

  // Only what this picker can use is offered; the rest of the library is
  // listed apart, so it can still be deleted — see `libraryFor`.
  const { choosable: libraryFiles, other } = libraryFor(files, kind);
  const visibleFiles = libraryFiles.filter((f) => f.url === justEdited || matchesQuery(query, [f.name, f.alt]));
  const otherFiles = other.filter((f) => matchesQuery(query, [f.name, f.alt]));
  const visibleStockPhotos = (activeCategory ? stockPhotos.filter((p) => p.category === activeCategory) : stockPhotos)
    .filter((p) => matchesQuery(query, [p.alt, p.category, p.credit]));
  const showingUploads = audio || tab === "uploads";

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
          aria-label={words.dialog}
          className="w-full max-w-lg rounded-xl border border-bg-border bg-bg-soft p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            {audio ? (
              // There is no bundled library of sounds, so there is no second
              // tab to offer — a "Stock photos" button here would hand an
              // audio block a photograph.
              <h2 className="text-sm font-medium text-fg">Your sounds</h2>
            ) : (
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
            )}
            <div className="flex items-center gap-2">
              {showingUploads ? (
                <>
                  <input ref={inputRef} type="file" accept={ACCEPT[kind]} onChange={handleUpload} className="hidden" />
                  <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} loading={uploading}>
                    Upload
                  </Button>
                </>
              ) : null}
              <button onClick={onClose} aria-label="Close" className="text-fg-muted hover:text-fg">×</button>
            </div>
          </div>

          {uploadError && showingUploads ? (
            <p role="alert" className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {uploadError}
            </p>
          ) : null}

          {/* A library you cannot search is a library you scroll. */}
          <div className="mb-3">
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setJustEdited(null); }}
              placeholder={showingUploads ? words.searchPlaceholder : "Search the photographs…"}
              aria-label={words.search}
            />
          </div>

          {showingUploads ? (
            <>
              {libraryFiles.length === 0 ? (
                <div className="text-sm text-fg-muted text-center py-8">{words.empty}</div>
              ) : visibleFiles.length === 0 ? (
                <div className="text-sm text-fg-muted text-center py-8">
                  Nothing here matches “{query}”.
                  <br />
                  {words.noMatch}
                </div>
              ) : (
                <>
                  {audio ? (
                    // A sound has no thumbnail, and a grid of identical note
                    // icons is a list of names with extra steps. Each row is its
                    // name and a small player, so the one wanted can be heard
                    // before it is chosen; nothing loads until it is played.
                    <ul aria-label="Sound files" className="max-h-80 overflow-y-auto space-y-1.5">
                      {visibleFiles.map((f) => (
                        <li
                          key={f.url}
                          onClick={() => void pick(f)}
                          className="rounded-lg border border-bg-border bg-bg px-2.5 py-2 cursor-pointer hover:border-brand/60"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void pick(f); }}
                              aria-label={`Choose ${f.name}`}
                              title={f.alt ? `${f.name} — ${f.alt}` : f.name}
                              className="flex-1 min-w-0 flex items-center gap-2 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                            >
                              <span aria-hidden className="text-fg-subtle">♪</span>
                              <span className="text-sm text-fg truncate">{f.name}</span>
                            </button>
                            {f.usedOn && f.usedOn.length > 0 ? (
                              <span
                                className="shrink-0 px-1.5 py-0.5 rounded bg-bg-card border border-bg-border text-[10px] text-fg-muted"
                                title={`Used on: ${f.usedOn.join(", ")}`}
                              >
                                in use
                              </span>
                            ) : null}
                            <button
                              aria-label={`Edit ${f.name}`}
                              title="Rename, or say what it is"
                              onClick={(e) => { e.stopPropagation(); startEditing(f); }}
                              className="shrink-0 w-6 h-6 rounded text-xs text-fg-subtle hover:text-fg hover:bg-bg-card"
                            >✎</button>
                            <button
                              aria-label={`Delete ${f.name}`}
                              onClick={(e) => { e.stopPropagation(); void handleDelete(f.url); }}
                              className="shrink-0 w-6 h-6 rounded text-sm text-fg-subtle hover:text-red-400 hover:bg-bg-card"
                            >×</button>
                          </div>
                          {/* Playing it is not choosing it. */}
                          <audio
                            controls
                            preload="none"
                            src={f.url}
                            aria-label={`Listen to ${f.name}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 block w-full h-9"
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                      {visibleFiles.map((f) => (
                        <div key={f.url} className="group relative rounded-lg overflow-hidden border border-bg-border bg-bg">
                          <div className="cursor-pointer" onClick={() => void pick(f)}>
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
                              onClick={(e) => { e.stopPropagation(); void handleDelete(f.url); }}
                              className="w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
                            >×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {editing ? (
                    <div className="mt-3 rounded-lg border border-bg-border bg-bg p-3 space-y-3">
                      <div className="flex items-center gap-3">
                        {audio ? (
                          <span aria-hidden className="w-12 h-12 shrink-0 rounded border border-bg-border bg-bg-card flex items-center justify-center text-lg text-fg-muted">♪</span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={editing.url} alt="" className="w-12 h-12 rounded object-cover border border-bg-border" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg">{words.editing}</p>
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
                          placeholder={words.namePlaceholder}
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label htmlFor="media-alt">{words.describe}</Label>
                        <Input
                          id="media-alt"
                          value={draftAlt}
                          onChange={(e) => setDraftAlt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveEdits(); } }}
                          placeholder={words.describePlaceholder}
                        />
                        <p className="text-[11px] text-fg-subtle mt-1">{words.describeHint}</p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button size="sm" onClick={saveEdits} loading={saving} disabled={!draftName.trim()}>Save</Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
              {otherFiles.length > 0 ? (
                <details className="mt-3 rounded-lg border border-bg-border bg-bg">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs text-fg-muted hover:text-fg">
                    Other files ({otherFiles.length})
                  </summary>
                  <div className="border-t border-bg-border px-3 py-2 space-y-1.5">
                    <p className="text-[11px] text-fg-subtle">
                      Uploads that are not pictures — sounds, videos, documents, fonts. An image cannot use them; they are
                      here so they can be deleted.
                    </p>
                    <ul aria-label="Other files" className="max-h-40 overflow-y-auto space-y-1">
                      {otherFiles.map((f) => (
                        <li key={f.url} className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 truncate text-xs text-fg" title={f.name}>{f.name}</span>
                          {f.usedOn && f.usedOn.length > 0 ? (
                            <span
                              className="shrink-0 px-1.5 py-0.5 rounded bg-bg-card border border-bg-border text-[10px] text-fg-muted"
                              title={`Used on: ${f.usedOn.join(", ")}`}
                            >
                              in use
                            </span>
                          ) : null}
                          <button
                            aria-label={`Delete ${f.name}`}
                            onClick={() => void handleDelete(f.url)}
                            className="shrink-0 w-6 h-6 rounded text-sm text-fg-subtle hover:text-red-400 hover:bg-bg-card"
                          >×</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ) : null}
            </>
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
