/**
 * The `srcset` of each picture a page shows, read from the library; see
 * `image-plan` for where the copies come from and `ImageVariantsProvider`
 * for where these go.
 */
import { prisma } from "./prisma";
import { srcSetOf, uploadAddresses } from "./image-plan";

/**
 * A `srcset` for every picture named in `texts` that has copies, by address.
 * Only those: the map is handed to the page's client components, and so is
 * in the page it is sent with.
 */
export async function srcSetsFor(texts: (string | null | undefined)[]): Promise<Record<string, string>> {
  const urls = uploadAddresses(texts.filter(Boolean).join("\n"));
  if (urls.length === 0) return {};
  const [mains, copies] = await Promise.all([
    prisma.mediaFile.findMany({ where: { url: { in: urls } }, select: { url: true, width: true } }),
    prisma.mediaFile.findMany({ where: { variantOf: { in: urls } }, select: { url: true, width: true, variantOf: true } }),
  ]);
  const out: Record<string, string> = {};
  for (const main of mains) {
    const own = copies
      .filter((c) => c.variantOf === main.url && c.width)
      .map((c) => ({ url: c.url, width: c.width as number }));
    const set = srcSetOf(main, own);
    if (set) out[main.url] = set;
  }
  return out;
}
