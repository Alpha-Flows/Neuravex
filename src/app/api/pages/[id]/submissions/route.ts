import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** How many answers one page of the viewer holds. */
const PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

/**
 * GET /api/pages/[id]/submissions
 *
 * `take: 100` with no total and no way to ask for the next hundred meant a
 * form with more answers than that quietly showed the newest hundred and
 * nothing said so — which also hid a page filling up with junk. The count and
 * the offset are what make the viewer honest.
 *
 * `?format=csv` hands back the same rows as a spreadsheet, because an answer
 * somebody typed into a contact form is the operator's to keep and there was
 * no way to get it out.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const url = new URL(req.url);
  const take = clamp(Number(url.searchParams.get("take")) || PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const skip = clamp(Number(url.searchParams.get("skip")) || 0, 0, Number.MAX_SAFE_INTEGER);
  const format = url.searchParams.get("format");

  if (format === "csv") {
    const all = await prisma.submission.findMany({
      where: { pageId: params.id },
      orderBy: { createdAt: "desc" },
    });
    return new NextResponse(toCsv(all), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="submissions-${params.id}.csv"`,
      },
    });
  }

  const [total, submissions] = await Promise.all([
    prisma.submission.count({ where: { pageId: params.id } }),
    prisma.submission.findMany({
      where: { pageId: params.id },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
  ]);

  return NextResponse.json({ total, skip, take, submissions });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/**
 * The submissions as a spreadsheet.
 *
 * One column per field anybody has ever answered, so a form that gained a
 * field halfway through still lines up. A value that begins with `=`, `+`, `-`
 * or `@` is prefixed with a quote: a spreadsheet treats those as formulas, and
 * these are words a stranger typed into a form on the open web.
 */
function toCsv(rows: { id: string; createdAt: Date; data: string }[]): string {
  const parsed = rows.map((row) => {
    let data: Record<string, unknown> = {};
    try {
      const value = JSON.parse(row.data);
      if (value && typeof value === "object" && !Array.isArray(value)) data = value as Record<string, unknown>;
    } catch {
      data = { raw: row.data };
    }
    return { id: row.id, createdAt: row.createdAt, data };
  });

  const fields = [...new Set(parsed.flatMap((row) => Object.keys(row.data)))].sort();
  const header = ["received", "id", ...fields];

  const lines = [header.map(cell).join(",")];
  for (const row of parsed) {
    lines.push(
      [row.createdAt.toISOString(), row.id, ...fields.map((f) => stringify(row.data[f]))]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function cell(value: string): string {
  // A spreadsheet reads a leading =, +, - or @ as the start of a formula.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}
