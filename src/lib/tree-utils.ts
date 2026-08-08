import { BaseBlock } from "@/types";

export function mapBlocks(blocks: BaseBlock[], fn: (b: BaseBlock) => BaseBlock): BaseBlock[] {
  return blocks.map((b) => {
    const next = fn({ ...b, children: b.children ? mapBlocks(b.children, fn) : undefined });
    return next;
  });
}

export function findInChildren(blocks: BaseBlock[], id: string): BaseBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) { const f = findInChildren(b.children, id); if (f) return f; }
  }
  return null;
}

export function findBlock(blocks: BaseBlock[], id: string): BaseBlock | null { return findInChildren(blocks, id); }

export function cloneTree<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export function updateContainer(blocks: BaseBlock[], containerId: string, fn: (list: BaseBlock[]) => BaseBlock[]): BaseBlock[] {
  if (containerId === "page") return fn(blocks);
  return blocks.map((b) => {
    if (`section-${b.id}` === containerId && b.children) return { ...b, children: fn(b.children) };
    if (b.type === "columns" && b.children) {
      const cols = ((b.props).count ?? 2) as number;
      const total = b.children.length;
      const perCol = Math.ceil(total / cols);
      const sub: BaseBlock[][] = Array.from({ length: cols }, () => []);
      b.children.forEach((c, i) => { const ci = Math.min(Math.floor(i / perCol), cols - 1); sub[ci].push(c); });
      for (let i = 0; i < cols; i++) { if (`col-${b.id}-${i}` === containerId) sub[i] = fn(sub[i]); }
      const merged: BaseBlock[] = [];
      for (let k = 0; k < cols; k++) for (const it of sub[k]) merged.push(it);
      return { ...b, children: merged };
    }
    if (b.children) return { ...b, children: updateContainer(b.children, containerId, fn) };
    return b;
  });
}

export function removeFromContainer(blocks: BaseBlock[], containerId: string, blockId: string, capture: (b: BaseBlock) => void): BaseBlock[] {
  if (containerId === "page") {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx >= 0) { capture(blocks[idx]); return blocks.filter((_, i) => i !== idx); }
    return blocks;
  }
  return updateContainer(blocks, containerId, (list) => {
    const idx = list.findIndex((b) => b.id === blockId);
    if (idx >= 0) { capture(list[idx]); return list.filter((_, i) => i !== idx); }
    return list;
  });
}

export function insertIntoContainer(blocks: BaseBlock[], containerId: string, block: BaseBlock, index: number | undefined): BaseBlock[] {
  return updateContainer(blocks, containerId, (list) => {
    const copy = list.slice();
    if (index == null || index >= copy.length) copy.push(block);
    else copy.splice(index, 0, block);
    return copy;
  });
}

export function applyOrder(blocks: BaseBlock[], containerId: string, newOrder: string[]): BaseBlock[] {
  return updateContainer(blocks, containerId, (list) => {
    const byId = new Map(list.map((b) => [b.id, b]));
    return newOrder.map((id) => byId.get(id)!).filter(Boolean);
  });
}

export function resolveDrop(overId: string, _blocks: BaseBlock[], parentMap: Map<string, string>, containerMap: Map<string, BaseBlock[]>): { container: string | null; index: number | null } {
  if (overId.endsWith("::drop-end")) return { container: overId.slice(0, -"::drop-end".length), index: null };
  const parent = parentMap.get(overId);
  if (!parent) return { container: null, index: null };
  const list = containerMap.get(parent);
  if (!list) return { container: null, index: null };
  const idx = list.findIndex((b) => b.id === overId);
  return { container: parent, index: idx < 0 ? null : idx };
}

export function distributeLeftToRight(blocks: BaseBlock[], cols: number): BaseBlock[][] {
  const buckets: BaseBlock[][] = Array.from({ length: cols }, () => []);
  if (blocks.length === 0) return buckets;
  const per = Math.ceil(blocks.length / cols);
  blocks.forEach((c, i) => {
    const ci = Math.min(Math.floor(i / per), cols - 1);
    buckets[ci].push(c);
  });
  return buckets;
}
