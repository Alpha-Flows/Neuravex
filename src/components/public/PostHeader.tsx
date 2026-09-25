import type { PostItem } from "@/lib/posts";
import { formatPostDate } from "@/lib/posts";

/**
 * The top of a blog post: its cover, its title, when it was written and by
 * whom, and its tags — drawn from the post's details above the blocks, so a
 * post never has to repeat them by hand, and changing the date in one place
 * changes it here, in the list of posts and in the feed.
 *
 * The same on the canvas and the published page; see `PublishedPageView`.
 */
export function PostHeader({
  post,
  language,
  coverSrcSet,
}: {
  post: Pick<PostItem, "title" | "date" | "author" | "coverImage" | "tags">;
  language: string;
  /** The cover's smaller copies, when it has some; see `srcSetsFor`. */
  coverSrcSet?: string;
}) {
  return (
    <header className="nvx-post-head nvx-site-column pt-12 pb-4">
      <div className="max-w-3xl mx-auto">
        {post.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            srcSet={coverSrcSet}
            // As wide as the 48rem column it sits in, or the window below that.
            sizes={coverSrcSet ? "(max-width: 48rem) 100vw, 48rem" : undefined}
            alt=""
            className="w-full aspect-[16/9] object-cover rounded-xl mb-8"
          />
        ) : null}
        <h1 className="text-4xl md:text-5xl font-bold leading-tight nvx-heading-1">{post.title}</h1>
        <p className="mt-3 opacity-70">
          {post.date ? <time dateTime={post.date}>{formatPostDate(post.date, language)}</time> : null}
          {post.author ? <>{post.date ? " · " : ""}{post.author}</> : null}
        </p>
        {post.tags.length > 0 ? (
          <ul role="list" aria-label="Tags" className="mt-4 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <li key={t} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
                {t}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </header>
  );
}
