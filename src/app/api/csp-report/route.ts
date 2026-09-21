import { NextRequest, NextResponse } from "next/server";

/**
 * Where the browser says a policy was broken.
 *
 * The Content Security Policy is the second layer under the sanitisers: if one
 * of them ever lets a <script>, a <style> element or a frame through, the
 * browser refuses it and the page carries on as if nothing happened. That is
 * the right behaviour and it is also the problem — nobody finds out. A report
 * endpoint turns a silent save into a line on the terminal the owner is
 * already watching.
 *
 * It is deliberately small: one line per violation, nothing stored, nothing
 * sent anywhere. A report is attacker-influenced text, so only the four fields
 * that are useful are read and each is truncated; the rest is dropped.
 */

/** Long enough to identify the offending rule, short enough not to fill a log. */
const FIELD_LIMIT = 300;

/** A report body is small; anything larger is not a report. */
const BODY_LIMIT = 16 * 1024;

function short(value: unknown): string {
  if (typeof value !== "string") return "";
  // Control characters would let a report forge extra log lines.
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, FIELD_LIMIT);
}

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > BODY_LIMIT) return new NextResponse(null, { status: 413 });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > BODY_LIMIT) return new NextResponse(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    // A malformed report is not worth a 400 anyone will read.
    return new NextResponse(null, { status: 204 });
  }

  const report = (body as { "csp-report"?: Record<string, unknown> })?.["csp-report"];
  if (report && typeof report === "object") {
    const directive = short(report["effective-directive"] ?? report["violated-directive"]);
    const blocked = short(report["blocked-uri"]);
    const document = short(report["document-uri"]);
    const sample = short(report["script-sample"]);
    process.stderr.write(
      `[neuravex] CSP refused ${directive || "something"} on ${document || "a page"}` +
        `${blocked ? ` from ${blocked}` : ""}${sample ? ` (${sample})` : ""}\n`,
    );
  }

  // 204: the browser is telling us, not asking us.
  return new NextResponse(null, { status: 204 });
}
