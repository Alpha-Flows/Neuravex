import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readBytesFromZip } from "./zip";

/**
 * Files larger than a request used to be allowed to be.
 *
 * Next cuts off every body the proxy sees at 10 MB, so no upload, no import
 * and no video could ever be larger than that, whatever the route allowed. The
 * upload now streams to disk on a route the proxy does not run on, and these
 * are the things that had to stay true when it moved: the file arrives whole,
 * is served back in the pieces a player asks for, goes into the download
 * whole, and another site still cannot send one.
 */

const MB = 1024 * 1024;

/** A file that reads as an MP4 from its first bytes, `size` bytes long. */
function mp4(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  bytes.write("ftypisom", 4, "ascii");
  for (let i = 16; i < size; i += 997) bytes[i] = i % 251;
  return bytes;
}

async function sendRaw(request: APIRequestContext, name: string, data: Buffer, headers: Record<string, string> = {}) {
  return request.post("/api/upload", {
    data,
    headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(name), ...headers },
  });
}

test.describe("A video larger than a form can carry", () => {
  test("arrives whole, is served in ranges, and goes into the download", async ({ request }) => {
    test.setTimeout(120_000);
    const video = mp4(12 * MB);
    const res = await sendRaw(request, "Workshop.mp4", video);
    expect(res.ok(), await res.text()).toBe(true);
    const { url, name } = await res.json();
    expect(url).toMatch(/^\/uploads\/[a-z0-9]+\.mp4$/);
    expect(name).toBe("Workshop.mp4");

    const whole = await request.get(url);
    expect(whole.headers()["content-length"]).toBe(String(video.length));
    expect((await whole.body()).equals(video)).toBe(true);

    // The last megabyte, the way a player asks once somebody drags to the end.
    const tail = await request.get(url, { headers: { range: `bytes=${11 * MB}-` } });
    expect(tail.status()).toBe(206);
    expect(tail.headers()["content-range"]).toBe(`bytes ${11 * MB}-${video.length - 1}/${video.length}`);
    expect((await tail.body()).equals(video.subarray(11 * MB))).toBe(true);

    const site = await (await request.post("/api/sites", { data: { name: `Large ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: { published: true, content: [{ id: "v", type: "video", props: { src: url } }] },
    });
    const download = await request.get(`/api/sites/${site.id}/download`);
    expect(download.ok()).toBe(true);
    const archive = Buffer.from(await download.body());
    expect(download.headers()["content-length"]).toBe(String(archive.length));
    expect(readBytesFromZip(archive, url.slice(1))?.equals(video)).toBe(true);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
    await request.delete("/api/media", { data: { url } });
  });

  test("is still refused as a form, with the way round it named", async ({ request }) => {
    const res = await request.post("/api/upload", {
      multipart: { file: { name: "clip.mp4", mimeType: "video/mp4", buffer: mp4(12 * MB) } },
    });
    expect(res.status()).toBe(413);
    expect(await res.text()).toContain("X-File-Name");
  });

  test("is judged by the limit for its kind: a picture of 12 MB is too large", async ({ request }) => {
    const png = Buffer.alloc(12 * MB);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    const res = await sendRaw(request, "poster.png", png);
    expect(res.status()).toBe(413);
    expect(await res.text()).toContain("the most a picture may be");
  });
});

test.describe("Choosing a video in the builder", () => {
  test("sends a file larger than a form could carry, and puts it in the block", async ({ page, request }) => {
    test.setTimeout(120_000);
    const site = await (await request.post("/api/sites", { data: { name: `Picker ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: { published: true, content: [{ id: "v", type: "video", props: { src: "" } }] },
    });
    await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);
    await page.waitForSelector(".public-canvas");
    await page.locator(".public-canvas .editor-block").first().click();

    await page.getByRole("button", { name: "Choose video file" }).click();
    const sent = page.waitForResponse((res) => res.url().endsWith("/api/upload"));
    await page.locator('[role="dialog"] input[type="file"]').first().setInputFiles({
      name: "Tour.mp4",
      mimeType: "video/mp4",
      buffer: mp4(12 * MB),
    });
    const res = await sent;
    expect(res.status()).toBe(200);
    // Sent as the file itself, not as a form.
    expect(res.request().headers()["x-file-name"]).toBe("Tour.mp4");
    const { url } = await res.json();
    await expect(page.locator(".public-canvas video")).toHaveAttribute("src", url);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
    await request.delete("/api/media", { data: { url } });
  });

  test("refuses a file over its limit before sending any of it", async ({ page, request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Picker ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: { published: true, content: [{ id: "v", type: "video", props: { src: "" } }] },
    });
    await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);
    await page.waitForSelector(".public-canvas");
    await page.locator(".public-canvas .editor-block").first().click();
    await page.getByRole("button", { name: "Choose video file" }).click();

    let posted = false;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/upload")) posted = true;
    });
    // Sparse, so it costs no time or disk to make, and a path, because
    // Playwright will not hand the page a buffer this large.
    const dir = mkdtempSync(join(tmpdir(), "nvx-huge-"));
    const huge = join(dir, "Huge.webm");
    writeFileSync(huge, "");
    truncateSync(huge, 251 * MB);
    await page.locator('[role="dialog"] input[type="file"]').first().setInputFiles(huge);
    await expect(page.getByText("the most a video may be")).toBeVisible();
    expect(posted).toBe(false);

    rmSync(dir, { recursive: true, force: true });
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The upload, outside the proxy", () => {
  test("still refuses a request another site set off", async ({ request }) => {
    const res = await sendRaw(request, "clip.mp4", mp4(1024), { origin: "https://evil.example" });
    expect(res.status()).toBe(403);
  });

  test("still refuses a name this server does not answer to", async ({ request }) => {
    const res = await sendRaw(request, "clip.mp4", mp4(1024), { host: "evil.example:3940" });
    expect(res.status()).toBe(421);
  });
});

test.describe("An archive larger than Next passes on", () => {
  test("is refused for its size, not as broken JSON", async ({ request }) => {
    // It said "not valid JSON": Next had cut it off at 10 MB before the route
    // saw it, and the route's own limit said 32.
    const padding = " ".repeat(12 * MB);
    const res = await request.post("/api/sites/import", {
      data: `{"site":{"name":"Too big"},"pages":[]${padding}}`,
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(413);
    expect(await res.text()).toContain("larger than 10 MB");
  });
});
