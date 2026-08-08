/**
 * Lightweight HTML sanitizer for user-generated content.
 * Strips script tags, event handlers, and javascript: URLs.
 * Since the content originates from our own editor, a regex-based
 * approach is sufficient — no need for a full DOM parser.
 */

const EVENT_ATTRS = /\s+on\w+\s*=\s*"[^"]*"/gi;
const SCRIPT_TAGS = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const JS_URL = /(?:href|src)\s*=\s*"javascript\s*:[^"]*"/gi;

export function sanitizeHtml(dirty: string): string {
  return dirty
    .replace(SCRIPT_TAGS, "")
    .replace(EVENT_ATTRS, "")
    .replace(JS_URL, 'href="#"');
}
