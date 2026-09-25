import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonObject } from "@/lib/request-body";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { MIN_FILL_MS } from "@/lib/form-fields";

export const dynamic = "force-dynamic";

const MAX_SUBMISSION_BYTES = 64 * 1024;

/** The whole body, not one key of it. */
const MAX_BODY_BYTES = 128 * 1024;

/**
 * What one client may send to one page, and how many answers a page may hold.
 *
 * This route has to answer a browser on somebody else's site — that is what a
 * published contact form is — so the Origin check deliberately does not cover
 * it, and nothing else did either. 500 submissions of about 60 KB went in over
 * 2.6 seconds and the database grew by 30 MB. Each row was bounded, the number
 * of rows was not, and the page id is printed into every published page.
 */
const PER_CLIENT = { max: 10, windowMs: 60_000 };
const MAX_PER_PAGE = 5_000;

// POST /api/submissions — store a form submission
export async function POST(req: NextRequest) {
  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const pageId = typeof body.pageId === "string" ? body.pageId : undefined;
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  const limit = rateLimit(`submit:${clientKey(req.headers)}:${pageId}`, PER_CLIENT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That form has been sent several times already. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // Programs, told apart from people the two cheap ways that catch most of
  // them. A published form had a rate limit and nothing else, and a program
  // filling in every form it finds stays under any limit a real enquiry needs.
  //
  // The trap is a field nobody can see. Filled in, the answer is taken as if
  // stored — a program told it failed tries another way; one told it worked
  // moves on — and nothing is written. No person is turned away by it, since
  // no person can reach the field.
  const trap = typeof body.trap === "string" ? body.trap : "";
  if (trap.trim()) return NextResponse.json({ ok: true }, { status: 201 });

  // The time since the form appeared, as the page measured it. Sent sooner
  // than a person can read and type, the answer is refused out loud rather
  // than dropped: a person who really was that quick presses Send again a
  // moment later and it goes through. Missing is allowed — a script of the
  // owner's own, or a page opened before this was added, sends none.
  const elapsed = typeof body.elapsed === "number" && Number.isFinite(body.elapsed) ? body.elapsed : undefined;
  if (elapsed !== undefined && elapsed >= 0 && elapsed < MIN_FILL_MS) {
    return NextResponse.json(
      { error: "That was sent quicker than a person fills a form in. Please check your answers and press Send again." },
      { status: 422 },
    );
  }

  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { id: true } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // A published page posts here with no authentication, so keep one
  // submission from being able to write an unbounded blob into the database.
  const payload = JSON.stringify(body.data ?? {});
  if (payload.length > MAX_SUBMISSION_BYTES) {
    return NextResponse.json({ error: "Submission too large" }, { status: 413 });
  }

  const held = await prisma.submission.count({ where: { pageId } });
  if (held >= MAX_PER_PAGE) {
    return NextResponse.json(
      { error: "This form is not accepting more answers at the moment." },
      { status: 507 },
    );
  }

  const sub = await prisma.submission.create({
    data: { pageId, data: payload },
  });
  return NextResponse.json(sub, { status: 201 });
}

/**
 * DELETE /api/submissions?pageId=…&before=…
 *
 * The generated privacy notice promises Art. 17 erasure and prints a retention
 * period, and there was no way to delete a submission at all — not one, not
 * all of them, not the ones older than the period the notice named. Deleting
 * the page moved them into the trash payload rather than erasing them.
 *
 * `before` is an ISO timestamp: everything older than it goes. Without it,
 * every submission on that page goes.
 */
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const pageId = url.searchParams.get("pageId");
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  const before = url.searchParams.get("before");
  let cutoff: Date | undefined;
  if (before) {
    cutoff = new Date(before);
    if (Number.isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: "`before` has to be a date." }, { status: 400 });
    }
  }

  const { count } = await prisma.submission.deleteMany({
    where: { pageId, ...(cutoff ? { createdAt: { lt: cutoff } } : {}) },
  });
  return NextResponse.json({ ok: true, deleted: count });
}
