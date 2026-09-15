import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

if (!process.env.SESSION_SECRET && !process.env.AUTH_PASSWORD) {
  // Neither is set — session cookies fall back to a fixed, publicly-known
  // key. Fine for a quick local trial, unsafe for anything reachable by
  // anyone else. Set SESSION_SECRET (recommended) or AUTH_PASSWORD.
  console.warn(
    "[neuravex] Neither SESSION_SECRET nor AUTH_PASSWORD is set — session cookies are being signed with a predictable default key. Set SESSION_SECRET in .env before exposing this instance to anyone else."
  );
}

const SECRET =
  process.env.SESSION_SECRET ||
  // Fall back to a deterministic key derived from AUTH_PASSWORD, kept only
  // for installs that relied on it before accounts moved into the database.
  // In production, SESSION_SECRET MUST be set to a random 32+ char string.
  createHmac("sha256", "neuravex-default-key")
    .update(process.env.AUTH_PASSWORD ?? "unset")
    .digest("hex");

const COOKIE_NAME = "neuravex_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Generate a signed session token bound to a specific user.
 * Format: `<userId>.<random-hex>.<hmac-hex>`, where the signature covers
 * `<userId>.<random-hex>` — so the userId can't be swapped without
 * invalidating the signature.
 */
export function createSessionToken(userId: string): string {
  const nonce = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", SECRET).update(`${userId}.${nonce}`).digest("hex");
  return `${userId}.${nonce}.${sig}`;
}

/**
 * Verify that a session token was signed by this server, returning the
 * userId it was issued for (or null if the token is invalid/malformed).
 */
export function verifySessionToken(token: string): { valid: boolean; userId: string | null } {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, userId: null };
  const [userId, nonce, sig] = parts;
  if (!userId || !nonce || !sig) return { valid: false, userId: null };
  const expected = createHmac("sha256", SECRET).update(`${userId}.${nonce}`).digest("hex");
  try {
    const ok = timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
    return ok ? { valid: true, userId } : { valid: false, userId: null };
  } catch {
    return { valid: false, userId: null };
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

// ---------------------------------------------------------------------------
// Per-user password hashing (scrypt — no extra native dependency)
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;

/**
 * Hash a password for storage. Format: `<salt-hex>:<hash-hex>`.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash produced by hashPassword().
 */
export function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const expected = scryptSync(password, salt, SCRYPT_KEYLEN);
    const actual = Buffer.from(hash, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Read and verify the auth cookie from the current request context (server
 * components, route handlers, server actions), returning the logged-in
 * user's id or null. Node-only — do not call from Edge middleware.
 */
export async function getSessionUserId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const { valid, userId } = verifySessionToken(token);
  return valid ? userId : null;
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

/**
 * Strip known XSS vectors from an uploaded SVG file's contents.
 * SVG can carry <script>, event handlers, and other HTML-equivalent
 * attack surface — this removes it while leaving the markup intact.
 */
export function sanitizeSvg(content: string): string {
  return content
    // Remove script tags and their contents
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Remove event handler attributes (onclick, onload, etc.)
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    // Remove javascript: and vbscript: URIs
    .replace(/(?:javascript|vbscript)\s*:/gi, "removed:")
    // Remove <foreignObject> (can embed HTML/CSS with XSS)
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    // Remove <use> with xlink:href to external resources
    .replace(/<use\b[^>]*\bxlink:href\s*=\s*["'][^"']*["'][^>]*\/?>/gi, "")
    // Remove inline <style> elements (can inject CSS-based attacks)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Remove style attributes that import external resources
    .replace(/\bstyle\s*=\s*["'][^"']*@import[^"']*["']/gi, "")
    // Remove data: URIs in href/xlink:href (can encode scripts)
    .replace(/(?:href|xlink:href)\s*=\s*["']data:[^"']*["']/gi, 'href="#"');
}
