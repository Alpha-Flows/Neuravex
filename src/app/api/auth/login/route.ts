import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPasswordHash,
  createSessionToken,
  SESSION_COOKIE,
} from "@/lib/security";

export const dynamic = "force-dynamic";

// Simple in-memory rate limiter (per-IP, resets on server restart)
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MIN_PASSWORD_LENGTH = 8;

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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/login — logs in an existing user, or (only when no
// accounts exist yet) creates the first one from whatever is submitted.
export async function POST(req: NextRequest) {
  const ip = (req as any).ip || req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email: string = (body.email ?? "").toString().trim().toLowerCase();
  const password: string = (body.password ?? "").toString();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const userCount = await prisma.user.count();

  let userId: string;

  if (userCount === 0) {
    // First run — whoever submits the setup form becomes the first account.
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }
    try {
      const user = await prisma.user.create({
        data: { email, passwordHash: hashPassword(password) },
      });
      userId = user.id;
    } catch {
      // Someone else's request created the first account in a race —
      // fall through and treat this as a normal login attempt.
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !verifyPasswordHash(password, user.passwordHash)) {
        return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
      }
      userId = user.id;
    }
  } else {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPasswordHash(password, user.passwordHash)) {
      return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
    }
    userId = user.id;
  }

  const token = createSessionToken(userId);
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
