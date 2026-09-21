/**
 * How often one client may do something.
 *
 * The form submission route has to answer a browser on somebody else's site
 * — that is what a published contact form is — so the Origin check cannot
 * cover it, and nothing else did. 500 submissions of 60 KB went in over 2.6
 * seconds, and the database grew by 30 MB with a 7 MB write-ahead log beside
 * it. Each row was bounded; the number of rows was not, the viewer's
 * `take: 100` hid the growth, and the page id is printed into every published
 * page. Sustained posts fill the disk and stop the whole app.
 *
 * In memory, because this is a single process serving one person's sites and
 * a table of counters in SQLite would be a write per request — the thing
 * being rate-limited. A restart forgets, which for a flood in progress costs
 * one more window.
 *
 * An operator who has published the builder behind a proxy should rate-limit
 * there as well; `INSTALL.md` says so. This is the floor, not the ceiling.
 */

interface Window {
  count: number;
  /** When this window opened, in milliseconds. */
  since: number;
}

const windows = new Map<string, Window>();

/** Stops the map growing without bound when every client is a new one. */
const MAX_TRACKED = 10_000;

export interface RateLimit {
  /** How many are allowed in one window. */
  max: number;
  /** How long the window is, in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets — for `Retry-After`. */
  retryAfter: number;
}

/**
 * Counts one attempt against a key, and says whether it is allowed.
 *
 * The key names both the client and what it is doing, so a rate limit on one
 * page's form does not slow another page's.
 */
export function rateLimit(key: string, { max, windowMs }: RateLimit, now = Date.now()): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || now - existing.since >= windowMs) {
    if (windows.size >= MAX_TRACKED) sweep(now, windowMs);
    windows.set(key, { count: 1, since: now });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count <= max) return { ok: true, retryAfter: 0 };

  return { ok: false, retryAfter: Math.ceil((existing.since + windowMs - now) / 1000) };
}

/** Drops windows that have expired. Called only when the map gets large. */
function sweep(now: number, windowMs: number): void {
  for (const [key, window] of windows) {
    if (now - window.since >= windowMs) windows.delete(key);
  }
  // Still full of live windows: this is a flood from many addresses, and
  // forgetting the oldest is better than growing without limit.
  if (windows.size >= MAX_TRACKED) {
    const half = Math.floor(windows.size / 2);
    let dropped = 0;
    for (const key of windows.keys()) {
      windows.delete(key);
      if (++dropped >= half) break;
    }
  }
}

/** For tests: nothing remembered from the last one. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Who a request appears to be from.
 *
 * Behind a proxy the real address is in `X-Forwarded-For`, and in front of one
 * that header is whatever the client typed — so it is read only where the
 * operator has said there is a proxy. Without one, every request to a
 * loopback-bound server comes from the same address anyway, and the page id in
 * the key is what keeps the limit meaningful.
 */
export function clientKey(headers: { get(name: string): string | null }): string {
  if (process.env.NEURAVEX_TRUST_PROXY === "1") {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded.slice(0, 64);
  }
  return "local";
}
