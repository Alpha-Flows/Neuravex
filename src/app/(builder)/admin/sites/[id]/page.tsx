import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { NewPageButton } from "@/components/admin/NewPageButton";
import { SiteSettings } from "@/components/admin/SiteSettings";
import { DeletePageButton } from "@/components/admin/DeletePageButton";
import { DuplicatePageButton } from "@/components/admin/DuplicatePageButton";
import { MovePageButton } from "@/components/admin/MovePageButton";
import { SubmissionsViewer } from "@/components/admin/SubmissionsViewer";
import { DownloadSiteButton } from "@/components/admin/DownloadSiteButton";

export const dynamic = "force-dynamic";

export default async function SiteAdmin({ params }: { params: { id: string } }) {
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: { pages: { orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }] } },
  });
  if (!site) notFound();

  const pages = site.pages;

  return (
    <div className="min-h-screen">
      <header className="border-b border-bg-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-fg-muted hover:text-fg text-sm">← All sites</Link>
            <div className="w-px h-5 bg-bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ background: site.accent }} />
              <span className="font-semibold">{site.name}</span>
              <span className="text-fg-muted text-sm">/{site.slug}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SiteSettings site={{ id: site.id, name: site.name, slug: site.slug, description: site.description, accent: site.accent }} />
            <DownloadSiteButton siteId={site.id} disabled={!pages.some((p) => p.published)} />
            {pages.find((p) => p.isHome && p.published) ? (
              <Link href={`/sites/${site.slug}`} target="_blank">
                <Button variant="outline">View site ↗</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Pages</h1>
            <p className="text-fg-muted mt-1">Edit a page to open the visual editor.</p>
          </div>
          <NewPageButton siteId={site.id} />
        </div>

        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted border-b border-bg-border">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-fg-muted">
                    No pages yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                pages.map((p, i) => (
                  <tr key={p.id} className="border-b border-bg-border last:border-0">
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-0.5">
                        <MovePageButton pageId={p.id} direction="up" disabled={i === 0} />
                        <MovePageButton pageId={p.id} direction="down" disabled={i === pages.length - 1} />
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {p.isHome ? <span title="Home page" className="text-amber-400">★</span> : null}
                        {p.title}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-fg-muted">/{p.slug}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          p.published
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-bg-soft text-fg-muted"
                        }`}
                      >
                        {p.published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-fg-muted">{new Date(p.updatedAt).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link href={`/admin/sites/${site.id}/pages/${p.id}`}>
                          <Button size="sm" variant="outline">Edit</Button>
                        </Link>
                        {p.published ? (
                          <Link href={p.isHome ? `/sites/${site.slug}` : `/sites/${site.slug}/${p.slug}`} target="_blank">
                            <Button size="sm" variant="ghost">View</Button>
                          </Link>
                        ) : null}
                        <DuplicatePageButton pageId={p.id} siteId={site.id} />
                        <DeletePageButton pageId={p.id} pageTitle={p.title} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        <div className="mt-10">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-lg font-semibold">Submissions</h2>
            <a href={`/api/sites/${site.id}/export`} className="text-xs text-fg-muted hover:text-fg underline ml-auto">Export site JSON (for re-importing into Neuravex)</a>
          </div>
          <Card className="p-5">
            <SubmissionsViewer siteId={site.id} />
          </Card>
        </div>
      </main>
    </div>
  );
}
