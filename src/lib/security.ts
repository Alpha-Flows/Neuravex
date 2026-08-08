import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

const SECRET =
  process.env.SESSION_SECRET ||
  // In dev, fall back to a deterministic key derived from AUTH_PASSWORD.
  // In production, SESSION_SECRET MUST be set to a random 32+ char string.
  createHmac("sha256", "neuravex-default-key")
    .update(process.env.AUTH_PASSWORD ?? "unset")
    .digest("hex");

const COOKIE_NAME = "neuravex_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Generate a signed session token.
 * Format: `<random-hex>.<hmac-hex>`
 */
export function createSessionToken(): string {
  const nonce = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", SECRET).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

/**
 * Verify that a session token was signed by this server.
 */
export function verifySessionToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [nonce, sig] = parts;
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", SECRET).update(nonce).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Constant-time password comparison.
 */
export function verifyPassword(input: string, expected: string): boolean {
  // Pad both to equal length to allow timingSafeEqual
  const inputBuf = Buffer.from(input.padEnd(256, "\0"));
  const expectedBuf = Buffer.from(expected.padEnd(256, "\0"));
  return (
    input.length === expected.length && timingSafeEqual(inputBuf, expectedBuf)
  );
}

/**
 * Cookie options for the session cookie.
 */
export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  maxAge: COOKIE_MAX_AGE,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // Set secure in production
  secure: process.env.NODE_ENV === "production",
};

// ---------------------------------------------------------------------------
// HTML / CSS sanitisation
// ---------------------------------------------------------------------------

/**
 * Sanitize CSS — strip anything that could exfiltrate data or execute code.
 * Removes: url(), @import, expression(), javascript:, behavior, -moz-binding
 */
export function sanitizeCss(css: string): string {
  return css
    // Remove @import rules (data exfiltration)
    .replace(/@import\b[^;]*;?/gi, "/* @import removed */")
    // Remove url() calls (data exfiltration via background-image etc.)
    .replace(/url\s*\([^)]*\)/gi, "/* url() removed */")
    // Remove expression() (IE script execution)
    .replace(/expression\s*\([^)]*\)/gi, "/* expression() removed */")
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, "/* javascript: removed */")
    // Remove behavior (IE HTCs)
    .replace(/behavior\s*:/gi, "/* behavior removed */")
    // Remove -moz-binding (Firefox XBL)
    .replace(/-moz-binding\s*:/gi, "/* -moz-binding removed */");
}

/**
 * Validate CSS custom property values to prevent injection.
 * Only allows safe characters for font-family, colors, and CSS units.
 */
export function sanitizeCssValue(value: string): string {
  // Allow: alphanumeric, spaces, commas, hashes, dots, parens, %, px, rem, em,
  //        single quotes, hyphens, underscores
  return value.replace(/[^a-zA-Z0-9\s,#.()%'"_-]/g, "");
}

// ---------------------------------------------------------------------------
// Open Redirect Prevention
// ---------------------------------------------------------------------------

/**
 * Validate a redirect URL to prevent open redirects.
 * Only allows relative paths starting with /.
 */
export function safeRedirectUrl(url: string, fallback: string = "/"): string {
  if (!url) return fallback;
  // Must start with / and must NOT start with // (protocol-relative)
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// File Upload Validation
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "svg",
  "ico",
  "mp4",
  "webm",
  "ogg",
  "mp3",
  "wav",
  "pdf",
  "woff",
  "woff2",
  "ttf",
  "otf",
]);

// SVG can contain scripts — strip them if accepted
const DANGEROUS_EXTENSIONS = new Set(["svg"]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateUploadFile(
  filename: string,
  size: number
): { valid: true; ext: string } | { valid: false; error: string } {
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type .${ext} is not allowed. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
    };
  }

  return { valid: true, ext };
}

export function isDangerousExtension(ext: string): boolean {
  return DANGEROUS_EXTENSIONS.has(ext.toLowerCase());
}
