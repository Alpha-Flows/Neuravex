import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "neuravex_auth";

// Inline HMAC verification to avoid importing Node crypto in Edge middleware.
// The full verifySessionToken lives in src/lib/security.ts for API routes.
async function verifyTokenEdge(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [nonce, sig] = parts;
  if (!nonce || !sig) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(nonce));
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Constant-length comparison (not truly constant-time in JS, but good enough
    // for a secondary check — primary defense is HMAC unforgeability).
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

async function deriveSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Mirror the HMAC derivation in src/lib/security.ts:
  // createHmac("sha256", "neuravex-default-key").update(AUTH_PASSWORD).digest("hex")
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("neuravex-default-key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(process.env.AUTH_PASSWORD ?? "unset")
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // No auth needed for public site, login page, auth API, static assets
  if (
    pathname.startsWith("/sites/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/templates") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // /api/submissions POST is public (form submissions), but GET must be authed
  if (pathname.startsWith("/api/submissions") && req.method === "POST") {
    return NextResponse.next();
  }

  // Any other route (admin, API) requires valid auth
  const cookie = req.cookies.get(AUTH_COOKIE);
  if (!cookie?.value || !(await verifyTokenEdge(cookie.value, await deriveSecret()))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
