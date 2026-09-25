"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { PostItem } from "@/lib/posts";

/**
 * The site's published posts, for every posts block on the page.
 *
 * Handed down rather than stored in the block: a block that kept a copy of
 * the list would need saving again every time a post was published, and a
 * page nobody reopened would go on listing last month's posts. The published
 * page and the editor both read the site's pages and provide the list here.
 */
interface SitePosts {
  posts: PostItem[];
  /** The site's language, for the dates. */
  language: string;
}

const SitePostsContext = createContext<SitePosts>({ posts: [], language: "en" });

export function SitePostsProvider({ posts, language, children }: SitePosts & { children: ReactNode }) {
  return <SitePostsContext.Provider value={{ posts, language }}>{children}</SitePostsContext.Provider>;
}

export function useSitePosts(): SitePosts {
  return useContext(SitePostsContext);
}
