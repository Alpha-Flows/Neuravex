import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
} from "@/lib/security";

export const dynamic = "force-dynamic";

// Simple in-memory rate limiter (per-IP, resets on server restart)
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password: string = (body.password ?? "").toString();
  const expected = process.env.AUTH_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "AUTH_PASSWORD not configured. Add it to .env." },
      { status: 500 }
    );
  }

  if (!verifyPassword(password, expected)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE.name, token, {
    httpOnly: SESSION_COOKIE.httpOnly,
    sameSite: SESSION_COOKIE.sameSite,
    maxAge: SESSION_COOKIE.maxAge,
    path: SESSION_COOKIE.path,
    secure: SESSION_COOKIE.secure,
  });
  return res;
}
