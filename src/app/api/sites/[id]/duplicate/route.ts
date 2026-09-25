import { NextRequest, NextResponse } from "next/server";
import { duplicateSite } from "@/lib/site-copy";

export const dynamic = "force-dynamic";

/**
 * POST /api/sites/[id]/duplicate — a copy of the whole site, pages and
 * settings, at a new address; see `lib/site-copy.ts`.
 */
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const copy = await duplicateSite(params.id);
    if (!copy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(copy, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That site could not be copied." }, { status: 500 });
  }
}
