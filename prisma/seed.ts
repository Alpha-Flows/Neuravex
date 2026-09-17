// Seed the database with an example site so the app is not empty on first run.
// Run with: npm run db:seed

import { PrismaClient } from "@prisma/client";
import { TEMPLATES, getTemplate } from "../src/lib/templates";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.site.findFirst({ where: { slug: "demo" } });
  if (existing) {
    console.log("Demo site already exists, skipping seed.");
    return;
  }
  const tpl = getTemplate("saas-landing");
  if (!tpl) throw new Error("SaaS template not found");

  const site = await prisma.site.create({
    data: {
      name: "Neuravex Demo",
      slug: "demo",
      description: "A sample site showing what Neuravex can do.",
      accent: "#6366f1",
      pages: {
        create: tpl.pages.map((p, i) => ({
          title: p.title,
          slug: p.slug,
          isHome: !!p.isHome,
          published: true,
          sortOrder: i,
          content: JSON.stringify(p.blocks),
        })),
      },
    },
  });

  console.log(`Seeded demo site at /sites/${site.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
