import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { validateUploadFile, isDangerousExtension, sanitizeSvg, isRenderableSvg } from "@/lib/security";
import { imageSize } from "@/lib/image-size";
import { prisma } from "@/lib/prisma";
import { cleanName, fileNameFromUrl } from "@/lib/media";

/**
 * Remember what the file was called when it arrived. It is stored under a
 * generated name so two uploads cannot collide, which used to mean the
 * library listed "mu59seflqpe0.png" and the customer's own name for the
 * picture was thrown away at the door.
 */
async function remember(url: string, original: string) {
  const name = cleanName(original) || fileNameFromUrl(url);
  await prisma.mediaFile.create({ data: { url, name } }).catch(() => {
    // A library entry is a convenience; an upload that cannot be described
    // is still an upload, and the file is already on disk.
  });
}

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
    // Everything the file had was stripped, so there is no picture left to
    // store. Saying so beats saving a blank that draws nothing.
    if (!isRenderableSvg(sanitized)) {
      return NextResponse.json(
        { error: "That SVG had nothing drawable left once the scripts were taken out." },
        { status: 400 },
      );
    }
    const sanitizedBuf = Buffer.from(sanitized, "utf8");
    const base = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const filename = `${base}.${validation.ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), sanitizedBuf);
    const svgUrl = `/uploads/${filename}`;
    await remember(svgUrl, file.name);
    // An SVG scales to whatever box it is given, so there is nothing to report.
    return NextResponse.json({ url: svgUrl, name: cleanName(file.name) || filename });
  }

  const base = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const filename = `${base}.${validation.ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), bytes);

  const url = `/uploads/${filename}`;
  await remember(url, file.name);
  // The size travels with the picture so a page can reserve its space.
  const size = imageSize(bytes);
  return NextResponse.json({ url, name: cleanName(file.name) || filename, ...(size ?? {}) });
}
