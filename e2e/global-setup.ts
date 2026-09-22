import type { FullConfig } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Proof, before a single test runs, that the server under test is reading the
 * throwaway database and not somebody's real one.
 *
 * `scripts/e2e.js` builds that database and points the whole run at it, which
 * is enough on its own — as long as the run went through `scripts/e2e.js` and
 * as long as Playwright really started the server it was told to. Neither is
 * worth assuming. The specs delete every site they create, permanently, so
 * the cost of being wrong is a developer's work rather than a red run.
 *
 * The check writes a row into the file we control and asks the server to read
 * it back. Doing it the other way around — POST a site through the API and
 * look for it in the file — would write into the developer's real database on
 * exactly the run this exists to stop.
 */
export default async function proveTheDatabaseIsOurs(config: FullConfig) {
  if (process.env.NEURAVEX_E2E !== "1") {
    throw new Error(
      "Run the browser suite with `npm run test:e2e`.\n" +
        "It builds the throwaway database this suite needs; run straight from Playwright " +
        "and the server reads whatever DATABASE_URL in .env points at — on a developer's " +
        "machine, their own sites, which these specs delete as they clean up.",
    );
  }

  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("No baseURL is configured, so there is nothing to check against.");

  const prisma = new PrismaClient();
  const slug = `e2e-guard-${process.pid}-${Date.now()}`;
  const marker = await prisma.site.create({ data: { name: "e2e guard", slug } });

  try {
    const response = await fetch(new URL("/api/sites", baseURL), { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`The server at ${baseURL} answered ${response.status} for /api/sites.`);

    const sites: unknown = await response.json();
    const found = Array.isArray(sites) && sites.some((site) => (site as { slug?: string })?.slug === slug);
    if (!found) {
      throw new Error(
        `The server at ${baseURL} is not reading the test database.\n` +
          "Something else is answering on that port, so the suite would create and delete " +
          "sites in whatever database that server has open. Quit it, or set NEURAVEX_E2E_PORT.",
      );
    }
  } finally {
    await prisma.site.delete({ where: { id: marker.id } }).catch(() => {
      // The database is thrown away when the run ends, so a marker that
      // outlives this function costs nothing. Failing the run over it would
      // be worse than leaving it.
    });
    await prisma.$disconnect();
  }
}
