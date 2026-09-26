import { NextResponse } from "next/server";
import { access, constants } from "fs/promises";
import { dirname } from "path";
import { prisma } from "@/lib/prisma";
import { uploadDir } from "@/lib/uploads";
import { APP_VERSION } from "@/lib/app-version";

export const dynamic = "force-dynamic";

/**
 * Whether uploads can be written: the directory, or — before the first upload
 * has made it — the nearest folder above it that exists.
 */
async function uploadsWritable(): Promise<boolean> {
  let dir = uploadDir();
  for (;;) {
    try {
      await access(dir, constants.W_OK);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return false;
      const parent = dirname(dir);
      if (parent === dir) return false;
      dir = parent;
    }
  }
}

/**
 * GET /api/health — whether this is Neuravex, which version, and whether it
 * can do its job: reach its database and write its uploads.
 *
 * The launcher decided the server was up when anything at all answered on the
 * port below a 500, so a second program already listening there was greeted
 * with "Ready!" and a browser tab of its own; Docker's check asked for the
 * site list, which reads every site; and a proxy had nothing to ask. This
 * answers from one query and one `access()` call, says `"app": "neuravex"`
 * so a caller can tell it apart from whatever else might be on the port, and
 * answers 503 when either half of the job cannot be done.
 */
export async function GET() {
  let journal: string | null = null;
  try {
    const rows = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
    journal = rows[0]?.journal_mode ?? null;
  } catch {
    journal = null;
  }
  const database = journal === null ? "unreachable" : "ok";
  const uploads = (await uploadsWritable()) ? "writable" : "not writable";
  const ok = database === "ok" && uploads === "writable";
  return NextResponse.json(
    { app: "neuravex", version: APP_VERSION, ok, database, uploads, journal },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
