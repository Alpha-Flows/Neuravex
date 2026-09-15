import { NextResponse } from "next/server";
import { access, readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

interface StockPhotoEntry {
  id: string;
  file: string;
  category: string;
  alt: string;
  credit?: string;
  creditUrl?: string;
  license?: string;
}

interface StockPhoto extends StockPhotoEntry {
  url: string;
}

function isValidEntry(entry: unknown): entry is StockPhotoEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.file === "string" &&
    !e.file.includes("..") &&
    typeof e.category === "string" &&
    typeof e.alt === "string"
  );
}

// GET /api/stock — list the bundled stock photo library. Entries whose
// backing file is missing are silently skipped rather than erroring, since
// this ships as static data that outlives any one file's presence.
export async function GET() {
  const stockDir = join(process.cwd(), "public", "stock");
  const manifestPath = join(stockDir, "manifest.json");

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    return NextResponse.json({ photos: [], categories: [] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ photos: [], categories: [] });
  }

  const entries = Array.isArray((parsed as any)?.photos) ? (parsed as any).photos : [];
  const valid: StockPhotoEntry[] = entries.filter(isValidEntry);

  const existing = await Promise.all(
    valid.map(async (entry) => {
      const exists = await access(join(stockDir, entry.file))
        .then(() => true)
        .catch(() => false);
      return exists ? entry : null;
    })
  );

  const photos: StockPhoto[] = existing
    .filter((e): e is StockPhotoEntry => e !== null)
    .map((entry) => ({ ...entry, url: `/stock/${entry.file}` }));

  const categories = Array.from(new Set(photos.map((p) => p.category))).sort();

  return NextResponse.json({ photos, categories });
}
