import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { DEFAULT_BODY_LIMIT, IMPORT_BODY_LIMIT, PROXY_BODY_LIMIT, readBodyBytes } from "./request-body";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the limits a route reads a body to", () => {
  it("fit inside what Next passes on through the proxy", () => {
    // Import allowed 32 MB, and Next cut every archive off at 10.
    for (const limit of [DEFAULT_BODY_LIMIT, IMPORT_BODY_LIMIT]) expect(limit).toBeLessThanOrEqual(PROXY_BODY_LIMIT);
  });

  it("are measured against the limit Next really applies", () => {
    const shipped = /proxyClientMaxBodySize:\s*(\d+)/.exec(source("node_modules/next/dist/server/config-shared.js"));
    expect(Number(shipped?.[1])).toBe(PROXY_BODY_LIMIT);
    // Raised in the config, it would hold every request to any route in memory
    // up to the new figure; see `config` in src/proxy.ts for the alternative.
    expect(source("next.config.js")).not.toMatch(/ClientMaxBodySize/);
  });
});

/** A request whose body arrives in pieces, with no length said up front. */
function streamed(pieces: number[], headers: Record<string, string> = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of pieces) controller.enqueue(new Uint8Array(size).fill(7));
      controller.close();
    },
  });
  // `duplex` is what a streamed body needs, and not in Next's type for it.
  const init = { method: "POST", body, headers, duplex: "half" } as unknown as ConstructorParameters<typeof NextRequest>[1];
  return new NextRequest("http://localhost/api/x", init);
}

describe("reading a body as bytes", () => {
  it("gives back every byte, in order", async () => {
    const read = await readBodyBytes(streamed([3, 4]), 10);
    expect(read.ok && Array.from(read.body)).toEqual([7, 7, 7, 7, 7, 7, 7]);
  });

  it("stops counting past the limit, whatever the length header said", async () => {
    const read = await readBodyBytes(streamed([6, 6]), 10);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.response.status).toBe(413);
  });

  it("refuses a body that says up front it is too large", async () => {
    const read = await readBodyBytes(streamed([1], { "content-length": "11" }), 10);
    expect(!read.ok && read.response.status).toBe(413);
  });
});
