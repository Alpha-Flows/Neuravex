import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { validateUploadFile, isDangerousExtension, sanitizeSvg } from "@/lib/security";

export const dynamic = "force-dynamic";

// POST /api/upload — accepts a single file, saves to public/uploads/
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const validation = validateUploadFile(file.name, file.size);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // If SVG, strip all known XSS vectors
  if (isDangerousExtension(validation.ext)) {
    const content = bytes.toString("utf8");
    const sanitized = sanitizeSvg(content);
    const sanitizedBuf = Buffer.from(sanitized, "utf8");
    const base = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const filename = `${base}.${validation.ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), sanitizedBuf);
    return NextResponse.json({ url: `/uploads/${filename}`, name: file.name });
  }

  const base = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const filename = `${base}.${validation.ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), bytes);

  return NextResponse.json({ url: `/uploads/${filename}`, name: file.name });
}
