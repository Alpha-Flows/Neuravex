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
import { uid } from "@/lib/utils";
import { mapBlocks, findBlock, cloneTree, updateContainer, removeFromContainer, insertIntoContainer, applyOrder, resolveDrop, groupIntoColumns, columnCount, removeBlock, withFreshIds } from "@/lib/tree-utils";
import { BlockPalette } from "./BlockPalette";
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

export function PageEditor({ pageId, siteId, siteSlug, initial }: Props) {
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
  const [activeDrag, setActiveDrag] = useState<{ kind: "palette" | "block"; type?: BlockType; block?: BaseBlock } | null>(null);

  // Undo / redo
  const [history, setHistory] = useState<BaseBlock[][]>([initial.blocks]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const pushHistory = useCallback((next: BaseBlock[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIdx + 1);
      const stack = [...trimmed, next].slice(-MAX_HISTORY);
      return stack;
    });
    setHistoryIdx((i) => Math.min(i + 1, MAX_HISTORY - 1));
    setBlocks(next);
    setDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIdx]);

  // Autosave timer
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) return;
    autosaveRef.current = setTimeout(() => save("autosave"), AUTOSAVE_MS);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, title, slug, isHome, published, blocks, seo]);

  const saveFn = useCallback(async (reason: "manual" | "autosave" = "manual") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/save`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug, isHome, published, content: blocks, ...seo, reason }),
      });
      setSaveFailed(!res.ok);
      if (res.ok) {
        setDirty(false);
        setSavedAt(new Date());
      }
    } catch {
      // A save that never lands must not look like one that did — the status
      // line is the only signal that the work is safe.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [pageId, title, slug, isHome, published, blocks, seo]);

  // Memo-ize save so the key event listener closure always has the latest
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;
  const save = useCallback((reason: "manual" | "autosave" = "manual") => saveRef.current(reason), []);

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
    pushHistory(mapBlocks(blocks, (b) => (b.id === updated.id ? updated : b)));
  }

  function deleteBlock(id: string) {
    const next = removeBlock(blocks, id);
    if (next === blocks) return;
    pushHistory(next);
    if (selectedId === id) setSelectedId(null);
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
      // Duplicate selected block
      if (mod && e.key === "d" && selectedId && !e.repeat) { e.preventDefault(); duplicateBlock(selectedId); return; }
      // Delete / Backspace — delete selected block (skip when editing text)
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
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
  }, [selectedId, blocks, historyIdx]);

  function undo() {
    if (historyIdx <= 0) return;
    const idx = historyIdx - 1;
    setHistoryIdx(idx);
    setBlocks(history[idx]);
    setDirty(true);
  }

  function redo() {
    if (historyIdx >= history.length - 1) return;
    const idx = historyIdx + 1;
    setHistoryIdx(idx);
    setBlocks(history[idx]);
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="h-screen flex flex-col bg-bg text-fg editor-mode">
        {/* Top bar */}
        <header className="h-14 px-4 border-b border-bg-border flex items-center gap-3 bg-bg-soft">
          <a href={`/admin/sites/${siteId}`} className="text-fg-muted hover:text-fg text-sm shrink-0">← Pages</a>
          <div className="w-px h-5 bg-bg-border shrink-0" />
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="h-8 w-40 font-medium shrink-0" />
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <span>/sites/{siteSlug}/</span>
            <Input value={slug} onChange={(e) => { setSlug(e.target.value); setDirty(true); }} className="h-7 w-28 text-xs" />
            {isHome ? <span className="ml-1 text-amber-400" title="Home page">★</span> : null}
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 ml-1 shrink-0">
            <button onClick={undo} disabled={historyIdx <= 0} title="Undo (Cmd+Z)" className="w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-card disabled:opacity-30 flex items-center justify-center text-sm">↩</button>
            <button onClick={redo} disabled={historyIdx >= history.length - 1} title="Redo (Shift+Cmd+Z)" className="w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-card disabled:opacity-30 flex items-center justify-center text-sm">↪</button>
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
            <PublishButton pageId={pageId} isHome={isHome} published={published} siteSlug={siteSlug} pageSlug={slug} onPublished={(p) => { p !== published && setDirty(true); setPublished(p); }} />
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
            <BlockPalette onInsert={(t) => { const pos = findInsertAfterSelected(); insertBlockAt(t, pos.container, pos.index); }} />
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
                <div className="public-canvas">
                  <PublicBlocks blocks={blocks} />
                </div>
              ) : (
                <div className="public-canvas" onClick={(e) => e.stopPropagation()}>
                  <SortableContainer
                    containerId="page"
                    blocks={blocks}
                    onChange={(next) => pushHistory(next)}
                    onSelect={(id) => setSelectedId(id)}
                    onDelete={deleteBlock}
                    onDuplicate={duplicateBlock}
                    selectedId={selectedId}
                    pageId={pageId}
                    emptyHint="Drag a block from the left to get started, or click any block to insert it here."
                  />
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

