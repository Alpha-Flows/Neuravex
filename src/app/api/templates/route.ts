import { NextResponse } from "next/server";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      cover: t.cover,
      pageCount: t.pages.length,
    })),
  );
}
