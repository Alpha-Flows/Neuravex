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
