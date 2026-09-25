/**
 * The icons an Icon block can show, by name.
 *
 * A block stores the name, never the drawing, so this list is what the
 * validator checks a stored name against: a name that is not here falls back
 * to the default rather than rendering nothing. It is kept free of imports on
 * purpose — `block-tree.ts` reads it on the server and in the editor, and the
 * drawings themselves live with the component that draws them.
 *
 * The names are lucide's own, in the kebab case its files use, so a name here
 * and the component that draws it can be checked against each other.
 */
export const ICON_NAMES = [
  "star", "heart", "check", "circle-check", "shield", "shield-check", "zap", "rocket",
  "clock", "calendar", "map-pin", "phone", "mail", "message-circle", "users", "user",
  "globe", "lock", "key", "settings", "wrench", "hammer", "leaf", "sun", "moon", "cloud",
  "camera", "image", "music", "headphones", "video", "mic", "book-open", "graduation-cap",
  "briefcase", "building-2", "house", "store", "shopping-cart", "shopping-bag",
  "credit-card", "wallet", "gift", "truck", "package", "award", "trophy", "target",
  "trending-up", "chart-bar", "chart-pie", "lightbulb", "sparkles", "palette", "pen-tool",
  "code", "terminal", "cpu", "database", "server", "smartphone", "monitor", "laptop", "wifi",
  "coffee", "utensils", "pizza", "wine", "car", "plane", "bike", "dumbbell", "activity",
  "stethoscope", "pill", "baby", "dog", "paw-print", "flower-2", "tree-pine", "mountain",
  "waves", "anchor", "compass", "flag", "bell", "thumbs-up", "smile", "handshake",
  "heart-handshake", "recycle", "scale", "gavel", "file-text", "download", "upload", "link",
  "external-link", "search", "info", "circle-help", "triangle-alert", "plus", "arrow-right",
  "quote", "play",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const DEFAULT_ICON: IconName = "star";

const KNOWN: ReadonlySet<string> = new Set(ICON_NAMES);

export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && KNOWN.has(value);
}
