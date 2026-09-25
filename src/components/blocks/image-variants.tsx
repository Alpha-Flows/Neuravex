"use client";
import { createContext, useContext, type ReactNode } from "react";

/**
 * The smaller copies of the pictures on the page, as a `srcset` for each
 * picture's address; see `image-plan`.
 *
 * Handed down rather than kept in the blocks, for the reason the posts are:
 * a block that stored its picture's copies would need saving again whenever
 * a copy was made, and every picture placed before copies existed would
 * never get one. The published page reads them for the pictures it carries.
 * The editor provides none — it is drawn on the machine that holds the files,
 * where the full picture costs nothing to fetch.
 */
const ImageVariantsContext = createContext<Record<string, string>>({});

export function ImageVariantsProvider({ value, children }: { value: Record<string, string>; children: ReactNode }) {
  return <ImageVariantsContext.Provider value={value}>{children}</ImageVariantsContext.Provider>;
}

/** The `srcset` of every picture on the page that has copies, by address. */
export function useSrcSets(): Record<string, string> {
  return useContext(ImageVariantsContext);
}

/** The `srcset` for one picture, or undefined when it has no copies. */
export function useSrcSet(src: string | undefined): string | undefined {
  const sets = useSrcSets();
  return src ? sets[src] : undefined;
}
