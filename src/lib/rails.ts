/**
 * Whether the editor's side rails are folded away.
 *
 * The canvas gets whatever room the rails leave it, and the two of them take
 * 34rem between them. On a 1600px window that left the page 1054px wide —
 * narrower than the 1200px column a visitor gets, so the canvas could not
 * show the line breaks the published page has however honest everything else
 * about it was. Folding a rail hands that room back.
 *
 * The choice is remembered, because it belongs to the person rather than to
 * the page: having to fold the palette away again on every page you opened
 * would be worse than not being able to fold it at all.
 */

const KEY = "neuravex:rails";

export interface RailState {
  /** The palette and outline, on the left. */
  left: boolean;
  /** The block inspector and page settings, on the right. */
  right: boolean;
}

/** Both rails open: what someone who has never folded one should see. */
export const RAILS_OPEN: RailState = { left: false, right: false };

export function readRails(storage?: Storage): RailState {
  try {
    const store = storage ?? window.localStorage;
    const raw = store.getItem(KEY);
    if (!raw) return RAILS_OPEN;
    const parsed = JSON.parse(raw);
    return {
      left: parsed?.left === true,
      right: parsed?.right === true,
    };
  } catch {
    // Private windows, cleared storage, a half-written value: all mean the
    // same thing here — show both rails.
    return RAILS_OPEN;
  }
}

export function writeRails(state: RailState, storage?: Storage): boolean {
  try {
    const store = storage ?? window.localStorage;
    store.setItem(KEY, JSON.stringify({ left: state.left === true, right: state.right === true }));
    return true;
  } catch {
    // A preference that cannot be stored is not worth failing an edit over.
    return false;
  }
}

/**
 * The same preference, as something a component can subscribe to.
 *
 * The editor used to keep its own copy in `useState` and seed it from storage
 * in an effect, which meant two places could disagree about which rails were
 * folded and the first paint always showed the wrong one. There is only one
 * answer to this question and `localStorage` already holds it, so this exposes
 * it as a store and the editor reads it directly.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders when
 * they differ, so returning a fresh object from every read would never stop
 * rendering. The snapshot is therefore cached until something writes.
 */
let snapshot: RailState | null = null;
const listeners = new Set<() => void>();

/** What the server renders: nobody has folded anything it can know about. */
export function railsServerSnapshot(): RailState {
  return RAILS_OPEN;
}

export function railsSnapshot(): RailState {
  if (!snapshot) snapshot = readRails();
  return snapshot;
}

export function subscribeRails(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Store the preference and tell everyone reading it. */
export function setRails(state: RailState): void {
  writeRails(state);
  snapshot = { left: state.left === true, right: state.right === true };
  for (const listener of listeners) listener();
}
