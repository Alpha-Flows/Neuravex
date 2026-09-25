"use client";
import { createContext, useContext } from "react";
import type { PageAnchor } from "@/lib/anchors";

/**
 * The named sections of the page being edited, as it stands this moment.
 *
 * The link targets the editor was opened with were read from the database, so
 * a section named a moment ago would not be offered until the page had been
 * saved and opened again. The editor knows its own blocks, and hands their
 * names down here to every link field and to the section panel, which warns
 * about a name already taken.
 */
const PageAnchorsContext = createContext<PageAnchor[]>([]);

export const PageAnchorsProvider = PageAnchorsContext.Provider;

export function usePageAnchors(): PageAnchor[] {
  return useContext(PageAnchorsContext);
}
