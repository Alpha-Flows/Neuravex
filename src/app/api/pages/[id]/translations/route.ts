import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";
import {
  linkTranslation,
  makeTranslation,
  translationState,
  unlinkTranslation,
  type TranslationOutcome,
} from "@/lib/translations-store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

function answer(outcome: TranslationOutcome) {
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ...outcome.state, ...(outcome.createdId ? { createdId: outcome.createdId } : {}) });
}

// GET /api/pages/[id]/translations — the page's versions in other languages.
export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params;
  const state = await translationState(params.id);
  return state ? NextResponse.json(state) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * POST /api/pages/[id]/translations — `{ language }` makes a draft copy of
 * the page to translate into that language; `{ pageId }` says an existing
 * page is this one in its own language.
 */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.pageId === "string") return answer(await linkTranslation(params.id, body.pageId));
  return answer(await makeTranslation(params.id, body.language));
}

// DELETE /api/pages/[id]/translations — this page is nobody's translation.
export async function DELETE(_req: NextRequest, props: Params) {
  const params = await props.params;
  return answer(await unlinkTranslation(params.id));
}
