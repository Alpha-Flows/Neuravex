import { test, expect } from "@playwright/test";

test.describe("Downloading a site", () => {
  test("returns a zip holding every published page and its images", async ({ request }) => {
    const site = await (
      await request.post("/api/sites", { data: { name: `Download E2E ${Date.now()}` } })
    ).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();

    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: {
        title: "Home",
        published: true,
        content: [
          {
            id: "h",
            type: "heading",
            props: { text: "Downloadable", level: 1, align: "left", color: "#0f172a", weight: "bold" },
          },
        ],
      },
    });
    const about = await (
      await request.post(`/api/sites/${site.id}/pages`, { data: { title: "About", slug: "about" } })
    ).json();
    await request.put(`/api/pages/${about.id}/save`, {
      data: { title: "About", published: true, content: [] },
    });
    // A draft must not leave the builder.
    await request.post(`/api/sites/${site.id}/pages`, { data: { title: "Draft", slug: "draft" } });

    const res = await request.get(`/api/sites/${site.id}/download`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/zip");
    expect(res.headers()["content-disposition"]).toContain(`${site.slug}.zip`);

    const zip = await res.body();
    expect(zip.subarray(0, 4).toString("binary")).toBe("PK");

    // File names live in the archive in plain text, so this is enough to see
    // what the download contains without unpacking it.
    const raw = zip.toString("binary");
    expect(raw).toContain("index.html");
    expect(raw).toContain("about.html");
    expect(raw).toContain("assets/site.css");
    expect(raw).toContain("README.txt");
    expect(raw).not.toContain("draft.html");

    await request.delete(`/api/sites/${site.id}`);
  });

  test("refuses a site with nothing published, and says why", async ({ request }) => {
    const site = await (
      await request.post("/api/sites", { data: { name: `Download Empty ${Date.now()}` } })
    ).json();

    const res = await request.get(`/api/sites/${site.id}/download`);
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain("no published pages");

    await request.delete(`/api/sites/${site.id}`);
  });

  test("the button is offered on the site page", async ({ page, request }) => {
    const site = await (
      await request.post("/api/sites", { data: { name: `Download UI ${Date.now()}` } })
    ).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: { title: "Home", published: true, content: [] },
    });

    await page.goto(`/admin/sites/${site.id}`);
    const button = page.getByRole("button", { name: "Download files" });
    await expect(button).toBeEnabled();

    const download = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download[0].suggestedFilename()).toBe(`${site.slug}.zip`);

    await request.delete(`/api/sites/${site.id}`);
  });
});
