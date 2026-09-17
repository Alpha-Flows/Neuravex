"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  rectIntersection,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { BaseBlock, BlockType } from "@/types";
import { getBlockDefinition } from "@/lib/blocks";
import { uid, slugify, cn } from "@/lib/utils";
import { siteThemeCss, headerOffset, SiteThemeInput } from "@/lib/site-theme";
import { scopeCss } from "@/lib/scope-css";
import { readClipboard, writeClipboard, pasteable } from "@/lib/clipboard";
import { sanitizeCss } from "@/lib/security";
import { SiteHeader, SiteFooter, SiteChrome, NavPage } from "@/components/public/SiteChrome";
import { mapBlocks, findBlock, cloneTree, updateContainer, removeFromContainer, insertIntoContainer, applyOrder, resolveDrop, groupIntoColumns, columnCount, removeBlock, withFreshIds } from "@/lib/tree-utils";
import { BlockPalette } from "./BlockPalette";
import { BlockOutline } from "./BlockOutline";
import { SavedBlocks } from "./SavedBlocks";
import { BlockInspector } from "./BlockInspector";
import { RevisionsPanel } from "./RevisionsPanel";
import { PageSettingsPanel, PageSeo } from "./PageSettingsPanel";
import { SortableContainer } from "../blocks/Sortable";
import { PublicBlocks } from "../public/PublicBlocks";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PublishButton } from "./PublishButton";

interface Props {
  pageId: string;
  siteId: string;
  siteSlug: string;
  /** The site's branding, so the canvas shows the colours the page will ship with. */
  theme: SiteThemeInput;
  /** The header, footer and custom CSS a visitor gets around this page. */
  chrome: { site: SiteChrome; pages: NavPage[]; customCss: string | null };
  initial: {
    title: string;
    slug: string;
    isHome: boolean;
    published: boolean;
    metaTitle: string;
    metaDescription: string;
    ogImage: string;
    blocks: BaseBlock[];
  };
}

const MAX_HISTORY = 80;
const AUTOSAVE_MS = 1500;
/**
 * Consecutive edits to the same block within this window become one undo
 * step. Typing reports every keystroke — that is what keeps a save honest —
 * and without this, undo would rewind one character at a time.
 */
const HISTORY_COALESCE_MS = 700;

/** True for anything that takes a caret: inputs, textareas, block text. */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

export function PageEditor({ pageId, siteId, siteSlug, theme, chrome, initial }: Props) {
  const [blocks, setBlocks] = useState<BaseBlock[]>(initial.blocks);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [isHome, setIsHome] = useState(initial.isHome);
  const [published, setPublished] = useState(initial.published);
  const [seo, setSeo] = useState<PageSeo>({
    metaTitle: initial.metaTitle,
    metaDescription: initial.metaDescription,
    ogImage: initial.ogImage,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [viewport, setViewport] = useState<"full" | "lg" | "md" | "sm">("full");
  const [leftTab, setLeftTab] = useState<"blocks" | "outline">("blocks");
  /** Bumped when a block is kept, so the palette shows it straight away. */
  const [savedKey, setSavedKey] = useState(0);
  const [activeDrag, setActiveDrag] = useState<{ kind: "palette" | "block"; type?: BlockType; block?: BaseBlock } | null>(null);

  // Undo / redo. The stack lives in a ref: keystrokes arrive faster than
  // React re-renders, and an index read from state was a render behind, which
  // wrote history entries over each other. The state below exists only so the
  // two buttons know when to grey out.
  const historyRef = useRef<{ stack: BaseBlock[][]; idx: number }>({ stack: [initial.blocks], idx: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // The last coalescable edit, so a run of keystrokes in one block collapses
  // into a single undo step instead of one per character.
  const coalesceRef = useRef<{ key: string; at: number } | null>(null);

  const syncHistoryButtons = useCallback(() => {
    const h = historyRef.current;
    setCanUndo(h.idx > 0);
    setCanRedo(h.idx < h.stack.length - 1);
  }, []);

  const pushHistory = useCallback((next: BaseBlock[], coalesceKey?: string) => {
    const now = Date.now();
    const last = coalesceRef.current;
    const merge =
      coalesceKey != null && last != null && last.key === coalesceKey && now - last.at < HISTORY_COALESCE_MS;
    coalesceRef.current = coalesceKey != null ? { key: coalesceKey, at: now } : null;

    const h = historyRef.current;
    if (merge) {
      // Same edit continuing: replace the top of the stack rather than grow it.
      h.stack[h.idx] = next;
    } else {
      const trimmed = h.stack.slice(0, h.idx + 1);
      trimmed.push(next);
      h.stack = trimmed.slice(Math.max(0, trimmed.length - MAX_HISTORY));
      h.idx = h.stack.length - 1;
    }
    syncHistoryButtons();
    setBlocks(next);
    setDirty(true);
  }, [syncHistoryButtons]);

  // Autosave timer
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) return;
    autosaveRef.current = setTimeout(() => save("autosave"), AUTOSAVE_MS);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, title, slug, isHome, published, blocks, seo]);

  const slugInputRef = useRef<HTMLInputElement | null>(null);

  const saveFn = useCallback(async (
    reason: "manual" | "autosave" = "manual",
    override?: { published?: boolean },
  ): Promise<boolean> => {
    const willPublish = override?.published ?? published;
    setSaving(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/save`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug, isHome, published: willPublish, content: blocks, ...seo, reason }),
      });
      setSaveFailed(!res.ok);
      if (!res.ok) return false;
      setDirty(false);
      setSavedAt(new Date());
      // The server has the last word on the slug: it lower-cases it and adds
      // a suffix when another page already owns that address. Take what it
      // settled on, so the URL shown here is the URL that exists — but never
      // rewrite the field while it is being typed in.
      const saved = await res.json().catch(() => null);
      if (saved?.slug && saved.slug !== slug && document.activeElement !== slugInputRef.current) {
        setSlug(saved.slug);
      }
      return true;
    } catch {
      // A save that never lands must not look like one that did — the status
      // line is the only signal that the work is safe.
      setSaveFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  }, [pageId, title, slug, isHome, published, blocks, seo]);

  // Memo-ize save so the key event listener closure always has the latest
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;
  const save = useCallback(
    (reason: "manual" | "autosave" = "manual", override?: { published?: boolean }) =>
      saveRef.current(reason, override),
    [],
  );

  // Publishing has to carry the current page with it. It used to flip a flag
  // on its own endpoint, which published whatever the last autosave had left
  // on the server — edits made in the seconds before the click went live only
  // when the next autosave caught up, and unreported text never at all.
  const togglePublished = useCallback(async (next: boolean) => {
    const ok = await saveRef.current("manual", { published: next });
    if (ok) setPublished(next);
    return ok;
  }, []);

  // Maps every block id to the container that holds it. Columns children are
  // grouped by their own `column`, so these ids match what Columns renders.
  const parentMap = useMemo(() => {
    const m = new Map<string, string>();
    function walk(list: BaseBlock[], parent: string) {
      for (const b of list) {
        m.set(b.id, parent);
        if (b.type === "columns" && b.children?.length) {
          groupIntoColumns(b.children, columnCount(b)).forEach((bucket, colIdx) => {
            walk(bucket, `col-${b.id}-${colIdx}`);
          });
        } else if (b.children?.length) {
          walk(b.children, `section-${b.id}`);
        }
      }
    }
    walk(blocks, "page");
    return m;
  }, [blocks]);

  const containerMap = useMemo(() => {
    const m = new Map<string, BaseBlock[]>();
    function get(parent: string): BaseBlock[] {
      if (!m.has(parent)) m.set(parent, []);
      return m.get(parent)!;
    }
    function walk(list: BaseBlock[], parent: string) {
      for (const b of list) {
        get(parent).push(b);
        if (b.type === "section" && b.children?.length) walk(b.children, `section-${b.id}`);
        if (b.type === "columns" && b.children?.length) {
          groupIntoColumns(b.children, columnCount(b)).forEach((bucket, colIdx) => {
            // Register the column even when empty so it stays a drop target.
            get(`col-${b.id}-${colIdx}`);
            walk(bucket, `col-${b.id}-${colIdx}`);
          });
        }
      }
    }
    walk(blocks, "page");
    return m;
  }, [blocks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function insertBlockAt(type: BlockType, containerId: string, atIndex?: number) {
    const def = getBlockDefinition(type);
    if (!def) return;
    const newBlock: BaseBlock = { id: `tmp-${uid()}`, type, props: JSON.parse(JSON.stringify(def.defaultProps)) };
    const next = containerId === "page"
      ? (() => { const copy = blocks.slice(); atIndex == null ? copy.push(newBlock) : copy.splice(atIndex, 0, newBlock); return copy; })()
      : updateContainer(blocks, containerId, (list) => { const copy = list.slice(); atIndex == null ? copy.push(newBlock) : copy.splice(atIndex, 0, newBlock); return copy; });
    pushHistory(next);
    setSelectedId(newBlock.id);
  }

  function replaceBlock(updated: BaseBlock) {
    pushHistory(
      mapBlocks(blocks, (b) => (b.id === updated.id ? updated : b)),
      `edit:${updated.id}`,
    );
  }

  function deleteBlock(id: string) {
    const next = removeBlock(blocks, id);
    if (next === blocks) return;
    pushHistory(next);
    if (selectedId === id) setSelectedId(null);
  }

  /** What is on the clipboard, for the hint in the palette. */
  const [clipboardLabel, setClipboardLabel] = useState<string | null>(null);
  useEffect(() => { setClipboardLabel(readClipboard()?.label ?? null); }, []);

  function pasteBlock(entry: ReturnType<typeof readClipboard>) {
    if (!entry) return;
    insertExistingBlock(pasteable(entry));
  }

  /** Put a block that already exists onto the page, after the selection. */
  function insertExistingBlock(block: BaseBlock) {
    const { container, index } = findInsertAfterSelected();
    const next =
      container === "page"
        ? (() => { const list = blocks.slice(); list.splice(index, 0, block); return list; })()
        : updateContainer(blocks, container, (list) => {
            const copy = list.slice();
            copy.splice(index, 0, block);
            return copy;
          });
    pushHistory(next);
    setSelectedId(block.id);
  }

  async function saveForReuse(name: string) {
    if (!selectedBlock) return;
    await fetch("/api/saved-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, block: selectedBlock }),
    });
    setSavedKey((k) => k + 1);
  }

  function duplicateBlock(id: string) {
    const original = findBlock(blocks, id);
    if (!original) return;
    const copy = withFreshIds(cloneTree(original));
    const next = insertAfterInTree(blocks, id, copy);
    pushHistory(next);
    setSelectedId(copy.id);
  }

  function insertAfterInTree(list: BaseBlock[], target: string, dup: BaseBlock): BaseBlock[] {
    let inserted = false;
    const out = list.map((b) => {
      if (inserted) return b;
      if (b.id === target) { inserted = true; return [b, dup]; }
      if (b.children?.length) {
        const nc = insertAfterInTree(b.children, target, dup);
        if (nc !== b.children) { inserted = true; return { ...b, children: nc }; }
      }
      return b;
    });
    return inserted ? out.flat() : list;
  }

  // A selected block that lives in a columns block can be moved between its
  // columns from the inspector. Placement is explicit now, so this is the
  // deliberate way to say "put this card in column 3".
  const selectedPlacement = useMemo(() => {
    if (!selectedId) return null;
    const container = parentMap.get(selectedId);
    if (!container || !container.startsWith("col-")) return null;
    const lastDash = container.lastIndexOf("-");
    const columnsBlockId = container.slice("col-".length, lastDash);
    const current = Number(container.slice(lastDash + 1));
    const parent = findBlock(blocks, columnsBlockId);
    if (!parent || !Number.isFinite(current)) return null;
    return { columnsBlockId, current, count: columnCount(parent) };
  }, [selectedId, parentMap, blocks]);

  function moveSelectedToColumn(target: number) {
    if (!selectedId || !selectedPlacement) return;
    const from = parentMap.get(selectedId);
    if (!from || target === selectedPlacement.current) return;
    let moved: BaseBlock | undefined;
    const removed = removeFromContainer(blocks, from, selectedId, (b) => (moved = b));
    if (!moved) return;
    pushHistory(insertIntoContainer(removed, `col-${selectedPlacement.columnsBlockId}-${target}`, moved, undefined));
  }

  // Where a palette click drops the new block: straight after the selection,
  // in whichever container holds it — including the specific column.
  function findInsertAfterSelected(): { container: string; index: number } {
    if (!selectedId) return { container: "page", index: blocks.length };
    const container = parentMap.get(selectedId);
    if (!container) return { container: "page", index: blocks.length };
    const siblings = containerMap.get(container) ?? [];
    const idx = siblings.findIndex((b) => b.id === selectedId);
    return { container, index: idx < 0 ? siblings.length : idx + 1 };
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      // Save
      if (mod && e.key === "s") { e.preventDefault(); save("manual"); return; }
      // Undo
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      // Redo
      if (mod && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); return; }
      // Copy, cut and paste — the way a block moves between pages. Skipped
      // while a caret is in text, where the browser's own copy and paste is
      // what the person means.
      if (mod && (e.key === "c" || e.key === "x") && selectedId && !isTextEntry(document.activeElement)) {
        const block = findBlock(blocks, selectedId);
        if (block) {
          e.preventDefault();
          const label = getBlockDefinition(block.type)?.label ?? block.type;
          if (writeClipboard(block, label)) {
            setClipboardLabel(label);
            if (e.key === "x") deleteBlock(selectedId);
          }
        }
        return;
      }
      if (mod && e.key === "v" && !isTextEntry(document.activeElement)) {
        const entry = readClipboard();
        if (entry) {
          e.preventDefault();
          pasteBlock(entry);
        }
        return;
      }
      // Duplicate selected block
      if (mod && e.key === "d" && selectedId && !e.repeat && !isTextEntry(document.activeElement)) { e.preventDefault(); duplicateBlock(selectedId); return; }
      // Delete / Backspace — delete the selected block, but never while a
      // caret is in something. Block text lives in a contentEditable, whose
      // tag is H1 or P, so a tag-name check let one backspace mid-sentence
      // delete the whole block.
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !isTextEntry(document.activeElement)) {
        e.preventDefault();
        deleteBlock(selectedId);
        return;
      }
      // Escape — deselect
      if (e.key === "Escape") { setSelectedId(null); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, blocks]);

  function undo() {
    const h = historyRef.current;
    if (h.idx <= 0) return;
    h.idx -= 1;
    // The next keystroke starts a new step rather than merging into the one
    // we just rewound past.
    coalesceRef.current = null;
    setBlocks(h.stack[h.idx]);
    syncHistoryButtons();
    setDirty(true);
  }

  function redo() {
    const h = historyRef.current;
    if (h.idx >= h.stack.length - 1) return;
    h.idx += 1;
    coalesceRef.current = null;
    setBlocks(h.stack[h.idx]);
    syncHistoryButtons();
    setDirty(true);
  }

  // Beforeunload guard
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // --- Drag handlers ---
  const dragStateRef = useRef<{ fromContainer: string | null }>({ fromContainer: null });

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("palette::")) {
      setActiveDrag({ kind: "palette", type: id.slice("palette::".length) as BlockType });
    } else {
      const block = findBlock(blocks, id);
      if (block) setActiveDrag({ kind: "block", block });
      dragStateRef.current.fromContainer = parentMap.get(id) ?? null;
    }
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    if (activeId.startsWith("palette::")) return;

    const from = dragStateRef.current.fromContainer;
    if (!from) return;
    const activeContainerId = active.data?.current?.containerId as string | undefined;
    // Update fromContainer in case a previous drag-over already moved it
    const currentFrom = parentMap.get(activeId);
    if (!currentFrom) return;
    const { container: toContainer } = resolveDrop(String(over.id), blocks, parentMap, containerMap);
    if (!toContainer || toContainer === currentFrom) return;

    // Live cross-container: move the active block to the new container
    let moved: BaseBlock | undefined;
    const removed = removeFromContainer(blocks, currentFrom, activeId, (b) => (moved = b));
    if (!moved) return;
    const destList = containerMap.get(toContainer) ?? [];
    const withInserted = insertIntoContainer(removed, toContainer, moved, destList.length);
    setBlocks(withInserted);
    setDirty(true);
    dragStateRef.current.fromContainer = toContainer;
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    dragStateRef.current.fromContainer = null;
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("palette::")) {
      const type = activeId.slice("palette::".length) as BlockType;
      const { container, index } = resolveDrop(overId, blocks, parentMap, containerMap);
      if (container) insertBlockAt(type, container, index ?? undefined);
      return;
    }

    const fromContainer = parentMap.get(activeId);
    if (!fromContainer) return;
    const { container: toContainer, index: toIndex } = resolveDrop(overId, blocks, parentMap, containerMap);
    if (!toContainer) return;

    let next: BaseBlock[];
    if (fromContainer === toContainer) {
      const list = containerMap.get(fromContainer)!.map((b) => b.id);
      const fromIndex = list.indexOf(activeId);
      if (fromIndex < 0 || toIndex == null) return;
      const newOrder = arrayMove(list, fromIndex, Math.min(toIndex, list.length - 1));
      next = applyOrder(blocks, fromContainer, newOrder);
    } else {
      let moved: BaseBlock | undefined;
      const removed = removeFromContainer(blocks, fromContainer, activeId, (b) => (moved = b));
      if (!moved) return;
      next = insertIntoContainer(removed, toContainer, moved, toIndex ?? undefined);
    }
    pushHistory(next);
  }

  const selectedBlock = selectedId ? findBlock(blocks, selectedId) : null;

  // Scoped to the canvas: on a published page this branding owns the document,
  // but here it must not repaint the palette and the inspector around it. The
  // site's own CSS is scoped the same way, for the same reason — a rule on
  // `body` would otherwise reach the builder's chrome.
  const themeCss = useMemo(() => siteThemeCss(theme, ".public-canvas"), [theme]);
  const customCss = useMemo(
    () => (chrome.customCss ? scopeCss(sanitizeCss(chrome.customCss), ".public-canvas") : ""),
    [chrome.customCss],
  );

  // The page has to leave room for a fixed header here too, or the canvas
  // shows the first block in a place the published page never puts it.
  const canvasStyle =
    chrome.site.headerPosition === "fixed" ? { paddingTop: headerOffset(chrome.site) } : undefined;

  /** The header and footer, exactly as a visitor gets them. */
  const siteChrome = (inner: React.ReactNode) => (
    // `relative` so a fixed header is held inside the canvas instead of
    // floating over the whole builder.
    <div className="public-canvas relative" style={canvasStyle}>
      <SiteHeader site={chrome.site} pages={chrome.pages} activeSlug={slug} contained />
      <main>{inner}</main>
      <SiteFooter site={chrome.site} />
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="h-screen flex flex-col bg-bg text-fg editor-mode">
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        {customCss ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: customCss }} />
            {/* The site's CSS cannot reach outside the canvas, but inside it a
                broad rule could still hide the controls for editing. */}
            <style>{".public-canvas .editor-toolbar, .public-canvas .editor-outline { display: block !important; visibility: visible !important }"}</style>
          </>
        ) : null}
        {/* Top bar */}
        <header className="h-14 px-4 border-b border-bg-border flex items-center gap-3 bg-bg-soft">
          <a href={`/admin/sites/${siteId}`} className="text-fg-muted hover:text-fg text-sm shrink-0">← Pages</a>
          <div className="w-px h-5 bg-bg-border shrink-0" />
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="h-8 w-40 font-medium shrink-0" />
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <span>/sites/{siteSlug}/</span>
            <Input
              ref={slugInputRef}
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setDirty(true); }}
              onBlur={() => { const clean = slugify(slug); if (slug.trim() && clean !== slug) setSlug(clean); }}
              className="h-7 w-28 text-xs"
              aria-label="Page URL"
            />
            {isHome ? <span className="ml-1 text-amber-400" title="Home page">★</span> : null}
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 ml-1 shrink-0">
            <button onClick={undo} disabled={!canUndo} title="Undo (Cmd+Z)" className="w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-card disabled:opacity-30 flex items-center justify-center text-sm">↩</button>
            <button onClick={redo} disabled={!canRedo} title="Redo (Shift+Cmd+Z)" className="w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-card disabled:opacity-30 flex items-center justify-center text-sm">↪</button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className={`text-xs shrink-0 ${saveFailed ? "text-red-400" : "text-fg-muted"}`}>
              {saving
                ? "Saving…"
                : saveFailed
                  ? "Couldn't save — press Save to retry"
                  : dirty
                    ? "Unsaved changes"
                    : savedAt
                      ? `Saved ${savedAt.toLocaleTimeString()}`
                      : "All saved"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? "Edit" : "Preview"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => save("manual")} loading={saving} disabled={!dirty}>
              Save
            </Button>
            <PublishButton isHome={isHome} published={published} siteSlug={siteSlug} pageSlug={slug} onToggle={togglePublished} />
            {isHome ? null : (
              <Button variant="ghost" size="sm" onClick={() => { setIsHome(true); setDirty(true); }} title="Set as home page">
                Make home
              </Button>
            )}
          </div>
        </header>

        {/* Body: palette | canvas | inspector */}
        <div className="flex-1 flex min-h-0">
          {!preview ? (
            <aside className="w-64 shrink-0 border-r border-bg-border bg-bg-soft h-full flex flex-col">
              <div className="flex border-b border-bg-border shrink-0">
                {(["blocks", "outline"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLeftTab(t)}
                    className={cn(
                      "flex-1 h-9 text-xs capitalize border-b-2 -mb-px",
                      leftTab === t ? "border-brand text-fg font-medium" : "border-transparent text-fg-muted hover:text-fg",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {leftTab === "blocks" ? (
                  <>
                    <BlockPalette
                      onInsert={(t) => { const pos = findInsertAfterSelected(); insertBlockAt(t, pos.container, pos.index); }}
                      pasteLabel={clipboardLabel}
                      onPaste={() => pasteBlock(readClipboard())}
                    />
                    <SavedBlocks refreshKey={savedKey} onInsert={insertExistingBlock} />
                  </>
                ) : (
                  <BlockOutline blocks={blocks} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} />
                )}
              </div>
            </aside>
          ) : (
            <div className="w-64 shrink-0 border-r border-bg-border bg-bg-soft p-4 text-sm text-fg-muted">
              <div className="text-xs uppercase tracking-wide font-semibold mb-3">Preview</div>
              <p>This is how visitors will see your page. Click Edit to keep making changes.</p>
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium mb-2">Viewport</div>
                <div className="inline-flex rounded-md border border-bg-border overflow-hidden w-full">
                  {(["full", "lg", "md", "sm"] as const).map((v) => (
                    <button key={v} onClick={() => setViewport(v)} className={`flex-1 h-8 text-xs uppercase ${viewport === v ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card"}`}>
                      {v === "full" ? "Full" : v === "lg" ? "1024" : v === "md" ? "768" : "480"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto" onClick={() => setSelectedId(null)}>
            <div className="mx-auto my-8 max-w-5xl rounded-xl shadow-2xl border border-bg-border overflow-hidden"
              style={preview && viewport !== "full" ? { maxWidth: viewport === "lg" ? 1024 : viewport === "md" ? 768 : 480 } : undefined}>
              {preview ? (
                siteChrome(<PublicBlocks blocks={blocks} />)
              ) : (
                <div onClick={(e) => e.stopPropagation()}>
                  {siteChrome(
                  <SortableContainer
                    containerId="page"
                    blocks={blocks}
                    onChange={(next, editKey) => pushHistory(next, editKey)}
                    onSelect={(id) => setSelectedId(id)}
                    onDelete={deleteBlock}
                    onDuplicate={duplicateBlock}
                    selectedId={selectedId}
                    pageId={pageId}
                    emptyHint="Drag a block from the left to get started, or click any block to insert it here."
                  />,
                  )}
                </div>
              )}
            </div>
            <div className="h-12" />
          </main>

          {!preview ? (
            selectedBlock ? (
              <BlockInspector
                block={selectedBlock}
                onChange={replaceBlock}
                onClose={() => setSelectedId(null)}
                placement={
                  selectedPlacement && selectedPlacement.count > 1
                    ? { current: selectedPlacement.current, count: selectedPlacement.count, onMove: moveSelectedToColumn }
                    : undefined
                }
                onSaveForReuse={saveForReuse}
              />
            ) : (
              <aside className="w-72 shrink-0 border-l border-bg-border bg-bg-soft h-full overflow-y-auto p-4">
                <PageSettingsPanel
                  seo={seo}
                  fallbackTitle={title}
                  onChange={(next) => { setSeo(next); setDirty(true); }}
                />
                <RevisionsPanel pageId={pageId} refreshKey={savedAt?.getTime() ?? 0} onRestore={() => window.location.reload()} />
              </aside>
            )
          ) : null}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag?.kind === "palette" && activeDrag.type ? (
            <div className="px-3 py-2 rounded-md bg-brand text-white text-sm shadow-xl">+ {getBlockDefinition(activeDrag.type)?.label}</div>
          ) : activeDrag?.kind === "block" && activeDrag.block ? (
            <div className="rounded-md bg-bg-card border border-brand px-3 py-2 text-sm shadow-xl">{getBlockDefinition(activeDrag.block.type)?.label}</div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}

