import { useSyncExternalStore } from "react";

/**
 * Whether this render is happening in a browser that has taken over the page.
 *
 * Several things here can only be known on the client — `document.body`, the
 * address in the URL bar, what is in `localStorage` — and rendering them on
 * the first pass would be a hydration mismatch, because the server had no way
 * to produce the same markup. The usual workaround is `useState(null)` plus an
 * effect that sets the real value on mount, and that is what every one of
 * these used to do.
 *
 * It works, but it is a `setState` during an effect, which is a second render
 * pass scheduled before the browser paints. React has an API for exactly this
 * question instead: `useSyncExternalStore` takes a separate snapshot for the
 * server, so the first pass renders the server's answer and the switch to the
 * client's happens as part of hydration rather than after it.
 *
 * Nothing ever changes, so the subscribe function is a constant that registers
 * nothing — the value differs between the two snapshots and never again.
 */

/** Nothing to subscribe to: the answer changes once, at hydration. */
const noop = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
