"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { siteThemeCss, SiteThemeInput } from "@/lib/site-theme";
import { normalizePalette } from "@/lib/palette";
import { SiteColorsProvider } from "./site-colors";
import { PageAnchorsProvider } from "./page-anchors";
import { sectionAnchors } from "@/lib/anchors";
import { scopeCss } from "@/lib/scope-css";
import { readClipboard, writeClipboard, pasteable, subscribeClipboard, clipboardLabel as readClipboardLabel, clipboardServerLabel } from "@/lib/clipboard";
import { containerChoices } from "@/lib/containers";
import { railsSnapshot, railsServerSnapshot, subscribeRails, setRails, RailState } from "@/lib/rails";
import { SiteHeader, SiteFooter, SiteChrome, NavPage, LegalPage } from "@/components/public/SiteChrome";
import { mapBlocks, findBlock, cloneTree, updateContainer, removeFromContainer, insertIntoContainer, applyOrder, resolveDrop, groupIntoColumns, columnCount, removeBlock, withFreshIds } from "@/lib/tree-utils";
import { isFloating, layerOf, levelRange, withLayer } from "@/lib/block-layer";
import { BlockPalette } from "./BlockPalette";
import { BlockOutline } from "./BlockOutline";
import { SavedBlocks } from "./SavedBlocks";
import { BlockInspector } from "./BlockInspector";
import type { LinkTarget } from "@/lib/page-links";
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
  /** The header, footer and custom CSS a visitor gets around this page. The CSS arrives sanitised. */
  chrome: { site: SiteChrome; pages: NavPage[]; legal: LegalPage[]; customCss: string | null };
  /** The request nonce, so the canvas stylesheets satisfy `style-src-elem`. */
  nonce?: string;
  /** Every page of this site, drafts included, for the inspector's link picker. */
  linkTargets: LinkTarget[];
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

/**
 * The widths the canvas can be pinned to. "Full" hands it the whole pane;
 * the rest are the sizes a phone and a tablet actually give a page, so a
 * layout can be checked against them without publishing first.
 */
const VIEWPORTS = [
  { key: "full", label: "Full", title: "Fill the window", width: null },
  { key: "lg", label: "1024", title: "Small laptop — 1024px", width: 1024 },
  { key: "md", label: "768", title: "Tablet — 768px", width: 768 },
  { key: "sm", label: "480", title: "Phone — 480px", width: 480 },
] as const;

type ViewportKey = (typeof VIEWPORTS)[number]["key"];

/** True for anything that takes a caret: inputs, textareas, block text. */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Whether a key belongs to whatever has focus rather than to the page.
 *
 * Text entry, as above — and anything in the inspector or a dialog. The
 * delete shortcut asked only the first question, so with the focus on a
 * button in the inspector — "Use the upright 9 / 16 shape", a column count,
 * a list row's "move up" — Backspace deleted the block being edited. The
 * buttons that remove themselves as they are pressed made it worse: focus
 * fell to the page, and the next Backspace a keyboard user pressed went
 * the same way. A key pressed in the panel is about the panel.
 *
 * The inspector is marked rather than found as "an aside". The first version
 * took every aside, and the left rail is one too: a block picked from the
 * outline, whose row then held the focus, could no longer be deleted,
 * duplicated or nudged from the keyboard at all. The outline's rows are the
 * blocks themselves, so a key pressed there is about the block.
 */
function keysBelongToFocus(el: Element | null): boolean {
  return isTextEntry(el) || !!el?.closest("[data-inspector], [role='dialog']");
}

export function PageEditor({ pageId, siteId, siteSlug, theme, chrome, linkTargets, initial, nonce }: Props) {
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
  const [viewport, setViewport] = useState<ViewportKey>("full");
  const [leftTab, setLeftTab] = useState<"blocks" | "outline">("blocks");
  // Which rails are folded away. It starts open on both sides and the stored
  // preference is applied after mount: read during the first render it would
  // not match the HTML the server sent, and React would throw the whole
  // canvas away and build it again.
  // Read straight from the store rather than copied into state: the
  // preference lives in localStorage, and a second copy here only created
  // something for it to disagree with on the first paint.
  const rails = useSyncExternalStore(subscribeRails, railsSnapshot, railsServerSnapshot);
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
  const clipboardLabel = useSyncExternalStore(subscribeClipboard, readClipboardLabel, clipboardServerLabel);

  function pasteBlock(entry: ReturnType<typeof readClipboard>) {
    if (!entry) return;
    // A copy taken by an older version, or one whose props no longer make a
    // block, pastes as nothing rather than as a page that will not render.
    const block = pasteable(entry);
    if (block) insertExistingBlock(block);
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

  /**
   * How far forward or back the blocks around this one are, so the inspector's
   * "bring to front" can mean in front of its actual neighbours rather than a
   * number the author has to guess at.
   */
  const selectedLevels = useMemo(() => {
    const container = selectedId ? parentMap.get(selectedId) : null;
    return levelRange(container ? containerMap.get(container) ?? [] : []);
  }, [selectedId, parentMap, containerMap]);

  /**
   * Nudging a floating block with the arrow keys.
   *
   * Dragging is how a float is placed, and dragging cannot line two of them up
   * with each other — the last half-percent is a keyboard job. Shift moves it
   * a whole step at a time. Keyed as one edit so holding an arrow down is one
   * undo press back, not forty.
   */
  function nudgeSelected(dx: number, dy: number) {
    if (!selectedId) return;
    const block = findBlock(blocks, selectedId);
    if (!block || !isFloating(block)) return;
    const layer = layerOf(block);
    const moved = withLayer(block, { x: layer.x + dx, y: layer.y + dy });
    pushHistory(mapBlocks(blocks, (b) => (b.id === selectedId ? moved : b)), `layer:${selectedId}`);
  }

  function moveSelectedToColumn(target: number) {
    if (!selectedId || !selectedPlacement) return;
    const from = parentMap.get(selectedId);
    if (!from || target === selectedPlacement.current) return;
    let moved: BaseBlock | undefined;
    const removed = removeFromContainer(blocks, from, selectedId, (b) => (moved = b));
    if (!moved) return;
    pushHistory(insertIntoContainer(removed, `col-${selectedPlacement.columnsBlockId}-${target}`, moved, undefined));
  }

  /**
   * Move the selected block into another container.
   *
   * This exists for floating blocks. A float is placed rather than ordered, so
   * `Sortable.tsx` switches its sortable off — dragging it within a list it
   * does not occupy would move nothing — and its handle means "move it across
   * the page" instead. That left no way to get a float out of the container it
   * was made in short of putting it back in the flow, dragging it, and
   * floating it again, which lost its position twice.
   *
   * Its `x`, `y` and `width` are shares of whatever it floats in, so they
   * survive the move and mean the same thing in the new box.
   */
  function moveSelectedToContainer(target: string) {
    if (!selectedId) return;
    const from = parentMap.get(selectedId);
    if (!from || from === target) return;

    let moved: BaseBlock | undefined;
    const removed = removeFromContainer(blocks, from, selectedId, (b) => (moved = b));
    if (!moved) return;

    // `insertIntoContainer` returns the tree unchanged when the id names no
    // container — and the block has already been taken out of the old one by
    // then, so publishing that tree would delete it. The block has to be
    // somewhere in the result before this becomes the page.
    const next = insertIntoContainer(removed, target, moved, undefined);
    if (!findBlock(next, selectedId)) return;
    pushHistory(next);
  }

  /** Where the selected block could go, and where it is now. */
  const containerTargets = useMemo(
    () => (selectedId ? containerChoices(blocks, selectedId) : []),
    [blocks, selectedId],
  );

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
      // Nothing below this line changes the page while it is being previewed.
      // A selection survives the switch — it has to, or previewing would cost
      // you your place — but it is invisible there, and Delete was quietly
      // throwing away a block with nothing on screen to say so.
      if (preview) return;
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
          // The palette's hint follows the store, so storing is all there is
          // to do here.
          if (writeClipboard(block, label)) {
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
      if (mod && e.key === "d" && selectedId && !e.repeat && !keysBelongToFocus(document.activeElement)) { e.preventDefault(); duplicateBlock(selectedId); return; }
      // Delete / Backspace — delete the selected block, but never while a
      // caret is in something. Block text lives in a contentEditable, whose
      // tag is H1 or P, so a tag-name check let one backspace mid-sentence
      // delete the whole block.
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !keysBelongToFocus(document.activeElement)) {
        e.preventDefault();
        deleteBlock(selectedId);
        return;
      }
      // Arrow keys nudge a floating block. Only a floating one: in the flow
      // there is nowhere to nudge to, and the arrows still scroll the canvas.
      if (e.key.startsWith("Arrow") && selectedId && !keysBelongToFocus(document.activeElement)) {
        const selected = findBlock(blocks, selectedId);
        if (selected && isFloating(selected)) {
          const step = e.shiftKey ? 2 : 0.5;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          if (dx !== 0 || dy !== 0) { e.preventDefault(); nudgeSelected(dx, dy); return; }
        }
      }
      // Escape — deselect
      if (e.key === "Escape") { setSelectedId(null); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, blocks, preview]);

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

  const toggleRail = useCallback((side: keyof RailState) => {
    const current = railsSnapshot();
    setRails({ ...current, [side]: !current[side] });
  }, []);

  // Bring the selected block into view.
  //
  // Picking one in the outline did nothing you could see: the canvas stayed
  // where it was and the inspector opened for a block a thousand pixels
  // further down, so the outline read as broken. `nearest` leaves a block
  // that is already on screen exactly where it is, so clicking a block on the
  // canvas never makes the page jump.
  useEffect(() => {
    if (!selectedId || preview) return;
    document
      .querySelector(".public-canvas .editor-block.is-selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, preview]);

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
  // The colours every colour field offers as swatches.
  const siteColors = useMemo(
    () => ({ accent: theme.accent ?? "", palette: normalizePalette(theme.palette) }),
    [theme.accent, theme.palette],
  );
  // This page's named sections as they stand now, for every link field.
  const pageAnchors = useMemo(() => sectionAnchors(blocks), [blocks]);
  // Already sanitised by the page that rendered this, so all that is left is
  // to hold it inside the canvas.
  const customCss = useMemo(
    () => (chrome.customCss ? scopeCss(chrome.customCss, ".public-canvas") : ""),
    [chrome.customCss],
  );

  const leftRailTitle = rails.left
    ? "Show the blocks panel"
    : "Hide the blocks panel and give the page its width";
  const rightRailTitle = rails.right
    ? selectedBlock
      ? "Show the settings for the selected block"
      : "Show the settings panel"
    : "Hide the settings panel and give the page its width";

  // Whatever width the canvas is pinned to, in both modes. Pinning it only
  // while previewing was what made Preview feel like a different page: the
  // canvas grew, every line re-wrapped and blocks landed somewhere else.
  const canvasWidth = VIEWPORTS.find((v) => v.key === viewport)?.width ?? null;

  /** The header and footer, exactly as a visitor gets them. */
  const siteChrome = (inner: React.ReactNode) => (
    // The canvas used to reserve room at the top for a fixed header, which
    // was drawn out of the flow. It is sticky in here now and takes its own
    // room — the padding on top of that put the first block lower than the
    // published page puts it.
    <div className="public-canvas relative">
      <SiteHeader site={chrome.site} pages={chrome.pages} activeSlug={slug} contained />
      <main>{inner}</main>
      <SiteFooter site={chrome.site} legal={chrome.legal} />
    </div>
  );

  return (
    <SiteColorsProvider value={siteColors}>
    <PageAnchorsProvider value={pageAnchors}>
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="h-screen flex flex-col bg-bg text-fg editor-mode">
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: themeCss }} />
        {customCss ? (
          <>
            <style nonce={nonce} dangerouslySetInnerHTML={{ __html: customCss }} />
            {/* The site's CSS cannot reach outside the canvas, but inside it a
                broad rule could still hide the controls for editing. */}
            <style nonce={nonce}>{".public-canvas .editor-toolbar, .public-canvas .editor-outline { display: block !important; visibility: visible !important }"}</style>
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

          {/*
            How wide the canvas is. This used to live inside the preview panel
            and apply only there, which meant pressing Preview re-laid the
            whole page out: different width, different line breaks, different
            place for every block. Here it belongs to the canvas itself, so
            Preview only takes the editing controls away — nothing moves.
          */}
          <div className="hidden md:inline-flex items-center rounded-md border border-bg-border overflow-hidden shrink-0 ml-1">
            {VIEWPORTS.map((v) => (
              <button
                key={v.key}
                onClick={() => setViewport(v.key)}
                aria-pressed={viewport === v.key}
                title={v.title}
                className={cn(
                  "h-7 px-2 text-[11px]",
                  viewport === v.key ? "bg-brand text-white" : "text-fg-muted hover:text-fg hover:bg-bg-card",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/*
            Folding the rails away. Between them they take 34rem, which on a
            1600px window left the page 1054px wide — narrower than the
            1200px column a visitor gets, so the canvas could not show the
            line breaks the published page has. These hand that room back.

            They live here rather than on the rails themselves so that a
            folded rail can leave nothing behind: a handle pinned to the edge
            would either eat into the width this is meant to recover or sit on
            top of the page.
          */}
          <div className="hidden md:inline-flex items-center rounded-md border border-bg-border overflow-hidden shrink-0 ml-1">
            <button
              onClick={() => toggleRail("left")}
              aria-pressed={!rails.left}
              aria-label={leftRailTitle}
              title={leftRailTitle}
              className={cn(
                "h-7 px-2 text-xs",
                rails.left ? "text-fg-subtle hover:text-fg hover:bg-bg-card" : "bg-bg-card text-fg",
              )}
            >
              ◧
            </button>
            <button
              onClick={() => toggleRail("right")}
              aria-pressed={!rails.right}
              aria-label={rightRailTitle}
              title={rightRailTitle}
              className={cn(
                "relative h-7 px-2 text-xs",
                rails.right ? "text-fg-subtle hover:text-fg hover:bg-bg-card" : "bg-bg-card text-fg",
              )}
            >
              ◨
              {/* Something is selected and its settings are out of sight. */}
              {rails.right && selectedBlock ? (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand" />
              ) : null}
            </button>
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

        {/* Body: palette | canvas | inspector. Either rail can be folded away,
            in which case it renders nothing and the canvas takes the room. */}
        <div className="flex-1 flex min-h-0">
          {rails.left ? null : !preview ? (
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
            // The same 16rem the palette takes, because the canvas beside it
            // must not change width when Preview is pressed.
            <div className="w-64 shrink-0 border-r border-bg-border bg-bg-soft p-4 text-sm text-fg-muted">
              <div className="text-xs uppercase tracking-wide font-semibold mb-3">Preview</div>
              <p>This is how visitors will see your page — the same widths and spacing the canvas was showing you, with the editing controls out of the way.</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => setPreview(false)}>
                Back to editing
              </Button>
              <p className="mt-4 text-xs text-fg-subtle">Use the width buttons in the toolbar to see the page at a phone or tablet size.</p>
            </div>
          )}

          {/*
            The canvas is a viewport, not a tall strip on a scrolling page.
            The pane used to do the scrolling and the frame was clipped with
            `overflow-hidden`, which made the frame a scroll container that
            never scrolled — so `position: sticky` inside it never engaged and
            a sticky or fixed header slid away as you scrolled, which is not
            what any visitor gets. Scrolling inside the frame makes it the
            scrollport, and a header holds its place there the way it does in
            a window.
          */}
          <main className="flex-1 min-h-0 flex py-8" onClick={() => setSelectedId(null)}>
            {/*
              The canvas takes the room it is given. It used to stop at 1024px
              whatever the window, so on a large screen you laid the page out
              at a width no visitor would see — and most of the monitor sat
              empty. The width buttons in the toolbar pin it to a phone or a
              tablet on purpose, and they do so whether you are editing or
              previewing.
            */}
            <div
              data-canvas-frame
              className="mx-auto w-full rounded-xl shadow-2xl border border-bg-border overflow-y-auto overflow-x-hidden"
              style={canvasWidth ? { maxWidth: canvasWidth } : undefined}
            >
              {/* One wrapper for both modes. Preview used to drop it, which
                  changed the shape of the tree around the page and gave the
                  browser a reason to lay it out afresh. `h-full` gives the
                  page inside it a height to measure itself against, so it can
                  fill the frame instead of the window. */}
              <div
                className="h-full"
                onClick={(e) => e.stopPropagation()}
                // The canvas is a drawing of the page, not a browser sitting
                // on it. Following a link from here — the site's own nav, a
                // button while previewing, an anchor inside custom HTML —
                // walked out of the builder and onto the published site,
                // which is never what clicking the page you are editing is
                // meant to do. The click still reaches the block underneath,
                // so it selects as any other click would; "View live" is the
                // way out.
                onClickCapture={(e) => {
                  if ((e.target as HTMLElement).closest?.("a[href]")) e.preventDefault();
                }}
              >
                {siteChrome(
                  preview ? (
                    <PublicBlocks blocks={blocks} />
                  ) : (
                    <SortableContainer
                      containerId="page"
                      blocks={blocks}
                      onChange={(next, editKey) => pushHistory(next, editKey)}
                      onSelect={(id) => setSelectedId(id)}
                      onDelete={deleteBlock}
                      onDuplicate={duplicateBlock}
                      selectedId={selectedId}
                      pageId={pageId}
                      emptyHint={
                        rails.left
                          ? "Press ◧ in the toolbar to bring the blocks panel back, then drag a block in here."
                          : "Drag a block from the left to get started, or click any block to insert it here."
                      }
                    />
                  ),
                )}
              </div>
            </div>
          </main>

          {/*
            The right-hand rail is never taken away. It used to disappear in
            preview, which handed the canvas another 18rem and re-laid the
            whole page out — the one thing Preview should not do. Previewing
            only swaps the block inspector for the page's own settings, which
            apply either way.
          */}
          {rails.right ? null : !preview && selectedBlock ? (
            <BlockInspector
              block={selectedBlock}
              onChange={replaceBlock}
              onClose={() => setSelectedId(null)}
              placement={
                selectedPlacement && selectedPlacement.count > 1
                  ? { current: selectedPlacement.current, count: selectedPlacement.count, onMove: moveSelectedToColumn }
                  : undefined
              }
              levels={selectedLevels}
              containers={
                selectedBlock.layer?.mode === "float"
                  ? {
                      current: parentMap.get(selectedBlock.id) ?? "page",
                      choices: containerTargets,
                      onMove: moveSelectedToContainer,
                    }
                  : undefined
              }
              onSaveForReuse={saveForReuse}
              linkTargets={linkTargets}
              siteSlug={siteSlug}
            />
          ) : (
            <aside data-inspector="" className="w-72 shrink-0 border-l border-bg-border bg-bg-soft h-full overflow-y-auto p-4">
              <PageSettingsPanel
                seo={seo}
                fallbackTitle={title}
                onChange={(next) => { setSeo(next); setDirty(true); }}
              />
              <RevisionsPanel pageId={pageId} refreshKey={savedAt?.getTime() ?? 0} onRestore={() => window.location.reload()} />
            </aside>
          )}
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
    </PageAnchorsProvider>
    </SiteColorsProvider>
  );
}

