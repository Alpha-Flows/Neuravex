/**
 * The drawing half of `image-plan`: a picture decoded in the browser, drawn
 * at the size it will be kept at, and encoded again, with its smaller copies.
 *
 * Only ever run in the builder's own page. It is a separate module from the
 * plan so that the plan can be tested without a canvas, and so that nothing
 * the server imports reaches for `document`.
 */
import { MAX_EDGE, QUALITY, canOptimise, isAnimated, keepRedrawn, keptSize, renamed, variantName, variantWidths } from "./image-plan";

export interface PreparedPicture {
  /** What to upload as the picture: the redrawn one, or the file as chosen. */
  main: File;
  /** Whether `main` is the redrawn picture. */
  redrawn: boolean;
  /** Smaller copies, by width. Empty when there are none to make. */
  variants: { file: File; width: number }[];
}

/** The canvas as a file of the given type, or null when the browser cannot make one. */
function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

function draw(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/** Whether any pixel of the canvas is less than opaque. */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/**
 * The format to encode in: WebP where the browser can write it, which every
 * current browser but some Safari versions can; otherwise JPEG for a picture
 * with no transparency, and PNG for one with some, since JPEG would paint the
 * transparent parts black.
 */
async function encodeBest(canvas: HTMLCanvasElement): Promise<{ blob: Blob; ext: string } | null> {
  const webp = await encode(canvas, "image/webp", QUALITY);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  if (!hasTransparency(canvas)) {
    const jpeg = await encode(canvas, "image/jpeg", QUALITY);
    if (jpeg && jpeg.type === "image/jpeg") return { blob: jpeg, ext: "jpg" };
  }
  const png = await encode(canvas, "image/png", 1);
  return png && png.type === "image/png" ? { blob: png, ext: "png" } : null;
}

/**
 * The picture made ready to upload, or null when it is to be sent as it is:
 * a format this does not redraw, an animation, a browser that cannot decode
 * or encode it, or a redrawn picture no lighter than the one chosen.
 *
 * `createImageBitmap` turns the picture the way its camera said it was held,
 * so a portrait taken on a phone is drawn upright — which the file as sent
 * was not always, once the upload route had taken its metadata out.
 */
export async function preparePicture(file: File): Promise<PreparedPicture | null> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  if (!canOptimise(file.name)) return null;
  try {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (isAnimated(head)) return null;

    const bitmap = await createImageBitmap(file);
    try {
      const kept = keptSize(bitmap.width, bitmap.height, MAX_EDGE);
      const resized = kept.width !== bitmap.width || kept.height !== bitmap.height;
      const canvas = draw(bitmap, kept.width, kept.height);
      if (!canvas) return null;
      const main = await encodeBest(canvas);
      if (!main) return null;

      const redrawn = keepRedrawn({ original: file.size, redrawn: main.blob.size, resized });
      const mainFile = redrawn
        ? new File([main.blob], renamed(file.name, main.ext), { type: main.blob.type })
        : file;

      const variants: PreparedPicture["variants"] = [];
      for (const width of variantWidths(kept.width)) {
        const height = Math.max(1, Math.round((kept.height * width) / kept.width));
        const copy = draw(bitmap, width, height);
        const encoded = copy ? await encodeBest(copy) : null;
        if (!encoded) continue;
        variants.push({ file: new File([encoded.blob], variantName(file.name, width, encoded.ext), { type: encoded.blob.type }), width });
      }
      return { main: mainFile, redrawn, variants };
    } finally {
      bitmap.close();
    }
  } catch {
    // A picture the browser cannot decode goes up as it is, and the server
    // says whether it will take it.
    return null;
  }
}
