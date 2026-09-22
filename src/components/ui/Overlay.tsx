"use client";
import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Something drawn over the whole window, from wherever in the tree it was
 * written.
 *
 * `position: fixed; z-index: 50` covers the window only for as long as nothing
 * between the element and the document root makes a stacking context of its
 * own. Blocks on the page now do exactly that — a container isolates its
 * blocks so one sent behind its neighbours cannot slide out from under the
 * page, and a floating block carries a z-index — and a dialog written inside a
 * block was then confined to the block's own layer: the picture library opened
 * *underneath* the site header, which caught every click meant for it.
 *
 * So these go to the body instead. Nothing about where they are written
 * changes — React still routes their events through the tree they belong to —
 * and nothing between them and the root can push them behind anything.
 */
export function Overlay({ children }: { children: ReactNode }) {
  // The body is not there while this is rendered on the server, and an overlay
  // that rendered in place first and moved afterwards would be a hydration
  // mismatch. Both of the things drawn this way appear in answer to a click,
  // so there is nothing to show before the browser has the page.
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return createPortal(children, document.body);
}
