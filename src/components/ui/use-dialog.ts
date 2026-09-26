"use client";
import { useEffect, useRef } from "react";

/**
 * What a dialog does with the keyboard while it is open.
 *
 * A dialog opened over the builder let Tab walk straight out of it into the
 * page underneath — the site list, the editor's toolbar — behind the dimmed
 * backdrop, where a keyboard user could no longer see where they were and a
 * screen reader user could not tell they had left. Closing one dropped focus
 * to the top of the document, so somebody who had opened "Check the site" by
 * keyboard started again from the first link on the page. And six of the
 * builder's seven dialogs were drawn by hand; only one of those six said it
 * was a dialog at all.
 *
 * So, while one is open: Tab and Shift+Tab go round its own controls and no
 * further; Escape closes it, as clicking the backdrop does; and closing hands
 * focus back to whatever had it before, when that is still on the page. Two
 * can be open at once — the site's settings with "Delete site" asking over
 * them — and then only the top one listens, or each would drag focus back
 * into itself.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/** The controls inside `node` that Tab reaches, in order, leaving out any that are not drawn. */
export function focusablesIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

/** The dialogs open now, the newest last. */
const open: symbol[] = [];

/**
 * The last few elements to have had focus, newest last.
 *
 * What had focus when a dialog opened cannot be read when it opens: a field
 * inside it with `autoFocus` has taken the focus by the time any effect runs,
 * so asking then answered with the dialog's own field, and closing handed
 * focus to an element that had just left the page. The history is how the
 * button that opened it is found.
 */
const recent: HTMLElement[] = [];
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      if (!(e.target instanceof HTMLElement) || recent[recent.length - 1] === e.target) return;
      recent.push(e.target);
      if (recent.length > 10) recent.shift();
    },
    true,
  );
}

/** The newest element that had focus outside `dialog` and is still on the page. */
function openerOf(dialog: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !dialog?.contains(active)) return active;
  for (let i = recent.length - 1; i >= 0; i--) {
    const el = recent[i];
    if (el.isConnected && !dialog?.contains(el)) return el;
  }
  return null;
}

export function useDialog<T extends HTMLElement = HTMLDivElement>(isOpen: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const me = Symbol("dialog");
    open.push(me);
    const opener = openerOf(ref.current);

    // After the dialog's own first render has placed any autoFocus: a field
    // that asked for the focus keeps it, and otherwise the first control has
    // it, or the dialog itself when it has none.
    const frame = requestAnimationFrame(() => {
      const node = ref.current;
      if (!node || node.contains(document.activeElement)) return;
      (focusablesIn(node)[0] ?? node).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      const node = ref.current;
      if (!node || open[open.length - 1] !== me) return;
      if (e.key === "Escape") {
        // Not also the page's own Escape, which in the editor clears the
        // selection underneath.
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusablesIn(node);
      const active = document.activeElement;
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      open.splice(open.indexOf(me), 1);
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  return ref;
}
