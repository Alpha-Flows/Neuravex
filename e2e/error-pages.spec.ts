import { test, expect } from "@playwright/test";

/**
 * The error boundaries, against a server whose database has no tables in it.
 *
 * There is no way to make a page here throw by storing something bad, and
 * that is deliberate: `normalizeBlockTree` refuses what cannot be stored,
 * `safeProps` and `BlockBoundary` catch what a block still does at render, and
 * `safeAccent` and `sanitizeCss` cover the rest. Every one of those was
 * written because of a real 500. So the only honest way to reach `error.tsx`
 * is to break the thing underneath all of it.
 *
 * `scripts/e2e.js` writes a zero-byte file — a valid, table-less SQLite
 * database — and runs a second server against it on the next port up. Every
 * query that server makes fails, which is exactly what a half-finished
 * install or an interrupted migration looks like.
 */

const BROKEN = `http://127.0.0.1:${Number(process.env.NEURAVEX_E2E_PORT || "3940") + 1}`;

test.describe("When the database cannot be read", () => {
  test("the builder offers a way out instead of a blank 500", async ({ page }) => {
    // The site list is the first thing anyone opens, and its `findMany` is
    // the first thing to fail.
    await page.goto(`${BROKEN}/`);

    await expect(page.getByText("Neuravex could not draw this page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("and never puts the raw error on the screen", async ({ page }) => {
    // In production Next replaces a server-side message with a digest, but a
    // client-side throw arrives intact — and a Prisma message carries the
    // absolute path of the database file and a fragment of the query.
    await page.goto(`${BROKEN}/`);
    const body = await page.locator("body").innerText();

    expect(body).not.toContain("prisma");
    expect(body).not.toContain("Invalid `prisma");
    expect(body).not.toMatch(/\/home\/|[A-Z]:\\/);
    expect(body).not.toContain("SELECT");
  });

  test("a published page fails inside its own document", async ({ page }) => {
    // The layout's own query decides <html lang>, so this is the one route
    // where the failure is *above* the page. If it is caught by the segment's
    // error.tsx the document survives; if not, global-error replaces it.
    // Either is acceptable — what is not is Next's stock white screen.
    await page.goto(`${BROKEN}/sites/demo`);

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/could not be loaded|could not start this page/);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("the last boundary still draws itself without the stylesheet", async ({ page }) => {
    // `global-error.tsx` replaces the root layout, so the CSS that layout
    // would have loaded is not there. Its styles are inline for that reason,
    // and this is the assertion that keeps them inline: a background that
    // resolves to the dark theme proves the page is not falling back to a
    // browser default.
    await page.goto(`${BROKEN}/sites/demo`);

    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
    expect(background).not.toBe("rgb(255, 255, 255)");
  });
});
