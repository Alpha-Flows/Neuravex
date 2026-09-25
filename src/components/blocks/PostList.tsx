"use client";
import type { PostsProps } from "@/types";
import { cn } from "@/lib/utils";
import { formatPostDate } from "@/lib/posts";
import { useSitePosts } from "./site-posts";
import { useSrcSets } from "./image-variants";

interface Props {
  props: PostsProps;
  disabled?: boolean;
}

/**
 * The site's posts, newest first — a blog's front page, or the latest three
 * on a home page.
 *
 * Every link is a plain link and every picture a plain picture, so the list
 * works the same in the download. A post's cover is decorative here — its
 * title, beside it, is the link's name — so it is given no text of its own.
 */
export function PostList({ props, disabled }: Props) {
  const { posts, language } = useSitePosts();
  const srcSets = useSrcSets();
  const tag = props.tag.trim().toLowerCase();
  const shown = posts.filter((p) => !tag || p.tags.some((t) => t.toLowerCase() === tag)).slice(0, props.count);

  if (shown.length === 0) {
    // Nothing to list is nothing on the published page, and a note on the
    // canvas, where the block would otherwise have no height to be found by.
    if (disabled) return null;
    return (
      <p className="text-sm opacity-60 py-6 text-center">
        {tag ? `No published posts are tagged "${props.tag}" yet.` : "No published posts yet."} They are listed here,
        newest first, as they are published.
      </p>
    );
  }

  return (
    <div className={cn("nvx-posts", props.layout === "grid" ? "grid gap-8 sm:grid-cols-2 lg:grid-cols-3" : "space-y-10 max-w-3xl")}>
      {shown.map((post) => (
        <article key={post.id} className={cn("nvx-post-card min-w-0", props.layout === "list" && props.showCover && post.coverImage ? "sm:flex sm:gap-6" : "")}>
          {props.showCover && post.coverImage ? (
            <a href={post.href} tabIndex={-1} aria-hidden="true" className={cn("block shrink-0", props.layout === "list" ? "sm:w-56 mb-3 sm:mb-0" : "mb-3")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.coverImage}
                srcSet={srcSets[post.coverImage]}
                // A third of the column in a grid, 14rem in a list, the width
                // of a phone below either.
                sizes={srcSets[post.coverImage] ? (props.layout === "grid" ? "(max-width: 640px) 100vw, 24rem" : "(max-width: 640px) 100vw, 14rem") : undefined}
                alt=""
                loading="lazy"
                className="w-full aspect-[16/10] object-cover rounded-lg"
              />
            </a>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-xl font-semibold leading-snug" style={{ fontFamily: "var(--site-heading-font, inherit)" }}>
              <a href={post.href} className="hover:underline underline-offset-4">{post.title}</a>
            </h3>
            {props.showDate ? (
              <p className="text-sm opacity-70 mt-1">
                <time dateTime={post.date}>{formatPostDate(post.date, language)}</time>
                {post.author ? <> · {post.author}</> : null}
              </p>
            ) : null}
            {props.showExcerpt && post.excerpt ? <p className="mt-2 leading-relaxed">{post.excerpt}</p> : null}
            {post.tags.length > 0 ? (
              <ul role="list" aria-label="Tags" className="mt-3 flex flex-wrap gap-1.5">
                {post.tags.map((t) => (
                  <li key={t} className="text-xs px-2 py-0.5 rounded-full border opacity-80" style={{ borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
