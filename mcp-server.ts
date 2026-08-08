/**
 * Neuravex MCP Server
 *
 * Exposes the website builder as MCP tools so AI agents (Claude, Cursor, etc.)
 * can create and manage websites programmatically.
 *
 * Usage:
 *   npx tsx mcp-server.ts          # development
 *   npm run mcp                    # after adding the script
 *
 * AI client config (e.g. ~/.cursor/mcp.json or claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "neuravex": {
 *         "command": "npx",
 *         "args": ["tsx", "mcp-server.ts"],
 *         "cwd": "/absolute/path/to/your/Website"
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { slugify } from "./src/lib/utils";
import { getTemplate } from "./src/lib/templates";

// ── Block structure validation ────────────────────────────────────

const VALID_BLOCK_TYPES = [
  "heading", "text", "image", "button", "divider", "spacer",
  "section", "columns", "video", "quote", "list", "form", "html",
] as const;

const blockSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(VALID_BLOCK_TYPES),
    props: z.record(z.string(), z.unknown()),
    children: z.array(blockSchema).optional(),
  })
);

const blockTreeSchema = z.array(blockSchema);

// ── DB ────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// Enable WAL mode + busy timeout so the MCP server and web app can share the DB
async function initDb() {
  await prisma.$connect();
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000");
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys=ON");
}

// ── MCP Server setup ──────────────────────────────────────────────

const server = new McpServer({
  name: "neuravex-builder",
  version: "0.1.0",
});

// ── Tools ──────────────────────────────────────────────────────────

// 1. List all templates
server.tool(
  "list_templates",
  "List all available starter templates with their descriptions and categories.",
  {},
  async () => {
    const templates = await import("./src/lib/templates").then((m) => m.TEMPLATES);
    const result = templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      pageCount: t.pages.length,
      pages: t.pages.map((p) => ({ title: p.title, slug: p.slug })),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// 2. List sites
server.tool(
  "list_sites",
  "List all sites in the CMS with their name, slug, page count, and status.",
  {},
  async () => {
    const sites = await prisma.site.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { pages: true } } },
    });
    const result = sites.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      accent: s.accent,
      pageCount: s._count.pages,
      updatedAt: s.updatedAt.toISOString(),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// 3. Get a site
server.tool(
  "get_site",
  "Get full details of a site by its slug (e.g. 'my-site') or id.",
  {
    slug: z.string().optional().describe("The site slug, e.g. 'my-site'"),
    id: z.string().optional().describe("The site id"),
  },
  async ({ slug, id }) => {
    const site = id
      ? await prisma.site.findUnique({ where: { id }, include: { pages: { orderBy: { sortOrder: "asc" } } } })
      : slug
        ? await prisma.site.findUnique({ where: { slug }, include: { pages: { orderBy: { sortOrder: "asc" } } } })
        : null;
    if (!site) return { content: [{ type: "text", text: "Site not found." }] };
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: site.id, name: site.name, slug: site.slug,
          description: site.description, accent: site.accent, theme: site.theme,
          pages: site.pages.map((p) => ({
            id: p.id, title: p.title, slug: p.slug,
            isHome: p.isHome, published: p.published, sortOrder: p.sortOrder,
          })),
        }, null, 2),
      }],
    };
  },
);

// 4. Create a site
server.tool(
  "create_site",
  "Create a new site, optionally from a template. Returns the slug so you can start editing.",
  {
    name: z.string().describe("The site name, e.g. 'My Bakery'"),
    description: z.string().optional().describe("A short description of the site"),
    templateId: z.string().optional().describe("Template id from list_templates. If omitted, creates a blank site."),
    accent: z.string().optional().describe("Hex accent color, e.g. '#10b981'. Defaults to '#6366f1'"),
  },
  async ({ name, description, templateId, accent }) => {
    let slug = slugify(name);
    let suffix = 0;
    const base = slug;
    while (await prisma.site.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    const site = await prisma.site.create({
      data: { name, slug, description: description ?? null, accent: accent ?? "#6366f1" },
    });

    if (templateId) {
      const tpl = getTemplate(templateId);
      if (tpl) {
        for (let i = 0; i < tpl.pages.length; i++) {
          await prisma.page.create({
            data: {
              siteId: site.id, title: tpl.pages[i].title, slug: tpl.pages[i].slug,
              isHome: !!tpl.pages[i].isHome, sortOrder: i,
              published: tpl.pages[i].published !== false,
              content: JSON.stringify(tpl.pages[i].blocks),
            },
          });
        }
      }
    } else {
      await prisma.page.create({
        data: { siteId: site.id, title: "Home", slug: "index", isHome: true, published: false, sortOrder: 0 },
      });
    }

    const pages = await prisma.page.findMany({
      where: { siteId: site.id },
      orderBy: { sortOrder: "asc" },
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: site.id, name: site.name, slug: site.slug, accent: site.accent,
          pages: pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug, isHome: p.isHome })),
        }, null, 2),
      }],
    };
  },
);

// 5. Delete a site
server.tool(
  "delete_site",
  "Permanently delete a site and all its pages. Requires the site id.",
  { id: z.string().describe("The site id") },
  async ({ id }) => {
    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) return { content: [{ type: "text", text: `Site ${id} not found.` }] };
    await prisma.site.delete({ where: { id } });
    return { content: [{ type: "text", text: `Deleted site "${site.name}" (${site.slug}).` }] };
  },
);

// 6. List pages for a site
server.tool(
  "list_pages",
  "List all pages belonging to a site, by site slug or id.",
  {
    siteSlug: z.string().optional().describe("The site slug"),
    siteId: z.string().optional().describe("The site id"),
  },
  async ({ siteSlug, siteId }) => {
    const site = siteId
      ? await prisma.site.findUnique({ where: { id: siteId } })
      : siteSlug
        ? await prisma.site.findUnique({ where: { slug: siteSlug } })
        : null;
    if (!site) return { content: [{ type: "text", text: "Site not found. Provide a valid siteSlug or siteId." }] };
    const pages = await prisma.page.findMany({
      where: { siteId: site.id },
      orderBy: { sortOrder: "asc" },
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify(pages.map((p) => ({
          id: p.id, title: p.title, slug: p.slug,
          isHome: p.isHome, published: p.published, sortOrder: p.sortOrder,
          blockCount: blockCount(p.content),
        })), null, 2),
      }],
    };
  },
);

// 7. Get a page with its blocks
server.tool(
  "get_page",
  "Get a full page with its complete block tree for editing. Returns the blocks as JSON.",
  { pageId: z.string().describe("The page id") },
  async ({ pageId }) => {
    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) return { content: [{ type: "text", text: "Page not found." }] };
    let blocks: unknown = [];
    try { blocks = JSON.parse(page.content || "[]"); } catch { /* empty */ }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: page.id, title: page.title, slug: page.slug,
          isHome: page.isHome, published: page.published,
          siteId: page.siteId, blocks,
        }, null, 2),
      }],
    };
  },
);

// 8. Create a page
server.tool(
  "create_page",
  "Create a new page for a site. Returns the new page id so you can edit it.",
  {
    siteSlug: z.string().optional().describe("The site slug"),
    siteId: z.string().optional().describe("The site id"),
    title: z.string().describe("Page title, e.g. 'About Us'"),
    slug: z.string().optional().describe("URL slug, auto-generated if omitted"),
  },
  async ({ siteSlug, siteId, title, slug }) => {
    const site = siteId
      ? await prisma.site.findUnique({ where: { id: siteId } })
      : siteSlug
        ? await prisma.site.findUnique({ where: { slug: siteSlug } })
        : null;
    if (!site) return { content: [{ type: "text", text: "Site not found." }] };

    let finalSlug = slugify(slug || title);
    let suffix = 0;
    const base = finalSlug;
    while (await prisma.page.findUnique({ where: { siteId_slug: { siteId: site.id, slug: finalSlug } } })) {
      suffix += 1;
      finalSlug = `${base}-${suffix}`;
    }
    const max = await prisma.page.findFirst({
      where: { siteId: site.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const page = await prisma.page.create({
      data: { siteId: site.id, title, slug: finalSlug, sortOrder: (max?.sortOrder ?? -1) + 1 },
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ id: page.id, title: page.title, slug: page.slug, siteSlug: site.slug }, null, 2),
      }],
    };
  },
);

// 9. Save / update a page (the main editing tool)
server.tool(
  "save_page",
  "Save or update the blocks and metadata of a page. This is the primary editing tool. Provide the full block tree as JSON.",
  {
    pageId: z.string().describe("The page id"),
    title: z.string().optional().describe("New page title"),
    slug: z.string().optional().describe("New URL slug"),
    published: z.boolean().optional().describe("Set to true to publish the page"),
    isHome: z.boolean().optional().describe("Set to true to make this the home page"),
    blocks: z.string().optional().describe("Full block tree as a JSON string. Each block has: id, type, props, and optional children. Example types: heading, text, image, button, section, columns, video, quote, list, form, html, divider, spacer."),
  },
  async ({ pageId, title, slug, published, isHome, blocks }) => {
    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) return { content: [{ type: "text", text: "Page not found." }] };

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (published !== undefined) data.published = published;
    if (isHome !== undefined) {
      data.isHome = isHome;
      if (isHome) {
        await prisma.page.updateMany({
          where: { siteId: page.siteId, id: { not: page.id }, isHome: true },
          data: { isHome: false },
        });
      }
    }
    if (slug !== undefined) {
      let s = slugify(slug);
      let suffix = 0;
      const base = s;
      while (true) {
        const e = await prisma.page.findUnique({ where: { siteId_slug: { siteId: page.siteId, slug: s } } });
        if (!e || e.id === pageId) break;
        suffix += 1;
        s = `${base}-${suffix}`;
      }
      data.slug = s;
    }
    if (blocks !== undefined) {
      try {
        const parsed = JSON.parse(blocks);
        // Validate block structure with Zod
        const result = blockTreeSchema.safeParse(parsed);
        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `Invalid block structure: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
            }],
          };
        }
        data.content = blocks;
      } catch {
        return { content: [{ type: "text", text: "Invalid JSON in blocks parameter." }] };
      }
    }
    const updated = await prisma.page.update({ where: { id: pageId }, data });

    // Save a revision
    if (blocks !== undefined || title !== undefined) {
      await prisma.revision.create({
        data: { pageId, title: updated.title, content: updated.content },
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: updated.id, title: updated.title, slug: updated.slug,
          isHome: updated.isHome, published: updated.published,
          saved: true,
        }, null, 2),
      }],
    };
  },
);

// 10. Publish / unpublish a page
server.tool(
  "publish_page",
  "Publish or unpublish a page so it appears (or disappears) from the public site.",
  {
    pageId: z.string().describe("The page id"),
    published: z.boolean().describe("true to publish, false to unpublish"),
  },
  async ({ pageId, published }) => {
    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) return { content: [{ type: "text", text: "Page not found." }] };
    await prisma.page.update({ where: { id: pageId }, data: { published } });
    return {
      content: [{ type: "text", text: `Page "${page.title}" is now ${published ? "published" : "unpublished"}.` }],
    };
  },
);

// 11. Delete a page
server.tool(
  "delete_page",
  "Permanently delete a page.",
  { pageId: z.string().describe("The page id") },
  async ({ pageId }) => {
    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) return { content: [{ type: "text", text: "Page not found." }] };
    await prisma.page.delete({ where: { id: pageId } });
    return { content: [{ type: "text", text: `Deleted page "${page.title}".` }] };
  },
);

// 12. Get site public URL
server.tool(
  "get_site_url",
  "Get the public URL for a site and its pages. Useful for previewing after publishing.",
  {
    siteSlug: z.string().optional().describe("The site slug"),
    siteId: z.string().optional().describe("The site id"),
  },
  async ({ siteSlug, siteId }) => {
    const site = siteId
      ? await prisma.site.findUnique({ where: { id: siteId }, include: { pages: true } })
      : siteSlug
        ? await prisma.site.findUnique({ where: { slug: siteSlug }, include: { pages: true } })
        : null;
    if (!site) return { content: [{ type: "text", text: "Site not found." }] };
    const host = process.env.PUBLIC_URL || "http://localhost:3000";
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          home: `${host}/sites/${site.slug}`,
          pages: site.pages.map((p) => ({
            title: p.title,
            url: p.isHome ? `${host}/sites/${site.slug}` : `${host}/sites/${site.slug}/${p.slug}`,
            published: p.published,
          })),
        }, null, 2),
      }],
    };
  },
);

// ── Block type reference (convenience tool for the AI) ────────────

server.tool(
  "get_block_reference",
  "Get the available block types and their property schemas so you know how to build blocks.",
  {},
  async () => {
    const blocks = await import("./src/lib/blocks").then((m) => m.BLOCKS);
    const ref = blocks.map((b) => ({
      type: b.type,
      label: b.label,
      description: b.description,
      category: b.category,
      exampleProps: b.defaultProps,
    }));
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          intro: "Each block has `id` (unique string), `type` (one of the types below), `props` (type-specific), and optional `children` (for section/columns only).",
          blocks: ref,
        }, null, 2),
      }],
    };
  },
);

// ── Start the server ───────────────────────────────────────────────

async function main() {
  await initDb();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Neuravex MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// ── Helpers ────────────────────────────────────────────────────────

function blockCount(contentJson: string): number {
  try {
    const arr = JSON.parse(contentJson);
    if (!Array.isArray(arr)) return 0;
    function count(b: unknown[]): number {
      let n = 0;
      for (const item of b) {
        if (item && typeof item === "object") {
          n += 1;
          const kids = (item as any).children;
          if (Array.isArray(kids)) n += count(kids);
        }
      }
      return n;
    }
    return count(arr);
  } catch {
    return 0;
  }
}
