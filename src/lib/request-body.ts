import { NextRequest, NextResponse } from "next/server";

/**
 * Reading a request body without letting it decide how much memory to use.
 *
 * Every JSON route did `await req.json()` first and checked a size afterwards
 * — and the size it checked was one key's, not the body's. A 40 MB body with
 * the padding sitting outside `data` was accepted with 201; a 200 MB body was
 * refused with 413 only after being fully materialised, by which point the
 * process had grown by about 960 MB. Import had no cap of any kind.
 *
 * The check has to happen before the bytes are kept, which means before
 * `JSON.parse` and before `req.json()`. `Content-Length` is a hint and a
 * client controls it, so it is used as the cheap early refusal and the stream
 * is counted as it arrives for the real one.
 */

/** What an ordinary route accepts. Generous for a page, small for an attacker. */
export const DEFAULT_BODY_LIMIT = 2 * 1024 * 1024;

/**
 * The most of a body Next passes on to a route the proxy runs on.
 *
 * Next copies the body for the proxy and cuts it off here without a word to
 * the route, which is left reading a truncated body as if it were whole. Every
 * limit below has to fit inside it; the upload route, which needs more, is
 * taken out of the proxy instead — see `config` in `src/proxy.ts`.
 */
export const PROXY_BODY_LIMIT = 10 * 1024 * 1024;

/**
 * An imported archive carries a whole site, so it gets all the room Next will
 * pass on. It was 32 MB, which Next never delivered: an archive of 12 MB
 * arrived cut off at 10 and was refused as "not valid JSON", which it was not.
 * Archives carry no pictures, so 10 MB is a great many pages.
 */
export const IMPORT_BODY_LIMIT = PROXY_BODY_LIMIT;

export type BodyResult<T> = { ok: true; body: T } | { ok: false; response: NextResponse };

function tooLarge(limit: number): NextResponse {
  return NextResponse.json(
    { error: `That request is larger than ${Math.round(limit / 1024 / 1024)} MB, so it was not read.` },
    { status: 413 },
  );
}

/**
 * The raw body, up to `limit` bytes, or a 413 to return.
 *
 * The stream is abandoned the moment the count passes the limit, so nothing
 * larger than the limit is ever held.
 */
export async function readBodyText(req: NextRequest, limit = DEFAULT_BODY_LIMIT): Promise<BodyResult<string>> {
  const bytes = await readBodyBytes(req, limit);
  return bytes.ok ? { ok: true, body: new TextDecoder().decode(bytes.body) } : bytes;
}

/** The same, as bytes: for a multipart body, which is not text. */
export async function readBodyBytes(req: NextRequest, limit = DEFAULT_BODY_LIMIT): Promise<BodyResult<Uint8Array>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return { ok: false, response: tooLarge(limit) };

  if (!req.body) return { ok: true, body: new Uint8Array(0) };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        return { ok: false, response: tooLarge(limit) };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: NextResponse.json({ error: "That request could not be read." }, { status: 400 }) };
  }

  return { ok: true, body: concat(chunks, total) };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/**
 * The body as JSON, size-checked first.
 *
 * A malformed body answers 400 rather than throwing into a 500 with an empty
 * response, which is what several of these routes used to do.
 */
export async function readJsonBody<T = unknown>(
  req: NextRequest,
  limit = DEFAULT_BODY_LIMIT,
): Promise<BodyResult<T>> {
  const text = await readBodyText(req, limit);
  if (!text.ok) return text;
  if (!text.body.trim()) return { ok: true, body: {} as T };

  try {
    return { ok: true, body: JSON.parse(text.body) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "That request body is not valid JSON." }, { status: 400 }),
    };
  }
}

/**
 * The JSON body as an object, or a 400.
 *
 * `JSON.parse("[]")` and `JSON.parse("null")` both succeed, and every route
 * here then read properties off the result — which is how a handful of
 * malformed requests reached Prisma with a number where a string belonged and
 * came back as a 500 with an empty body.
 */
export async function readJsonObject(
  req: NextRequest,
  limit = DEFAULT_BODY_LIMIT,
): Promise<BodyResult<Record<string, unknown>>> {
  const parsed = await readJsonBody<unknown>(req, limit);
  if (!parsed.ok) return parsed;
  if (!parsed.body || typeof parsed.body !== "object" || Array.isArray(parsed.body)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "That request body has to be a JSON object." }, { status: 400 }),
    };
  }
  return { ok: true, body: parsed.body as Record<string, unknown> };
}
