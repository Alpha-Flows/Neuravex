import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { NewSiteButton } from "@/components/admin/NewSiteButton";
import { TrashPanel } from "@/components/admin/TrashPanel";
import { NetworkNotice } from "@/components/admin/NetworkNotice";
import { safeAccent } from "@/lib/site-fields";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const sites = await prisma.site.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { pages: true } } },
  });

  return (
    <div className="min-h-screen">
      <NetworkNotice />
      <header className="border-b border-bg-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500" />
            <span className="font-semibold">Neuravex</span>
            <span className="text-fg-muted text-sm ml-1">Website Builder</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Your sites</h1>
            <p className="text-fg-muted mt-1">Create a new site or open an existing one to edit.</p>
          </div>
          <NewSiteButton />
        </div>

        {sites.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-bg-soft flex items-center justify-center text-2xl mb-3">✦</div>
            <h2 className="text-lg font-semibold">No sites yet</h2>
            <p className="text-fg-muted mt-1 max-w-md mx-auto">
              Start from a template or a blank canvas. You can edit every detail and publish when you&apos;re ready.
            </p>
            <div className="mt-5 flex justify-center">
              <NewSiteButton large />
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <Link
                key={site.id}
                href={`/admin/sites/${site.id}`}
                className="group block rounded-xl border border-bg-border bg-bg-card hover:border-brand/60 transition-colors overflow-hidden"
              >
                <div
                  className="h-32 w-full"
                  style={{
                    // Through safeAccent, not straight from the row: this is the one
                    // CSS sink that fires on the admin home page, so a site
                    // created over MCP with an accent carrying a second
                    // declaration beaconed here without ever being opened.
                    background: `linear-gradient(135deg, ${safeAccent(site.accent)} 0%, #1f2937 100%)`,
                  }}
                />
                <div className="p-4">
                  <div className="font-semibold truncate">{site.name}</div>
                  <div className="text-fg-muted text-sm truncate">/{site.slug}</div>
                  <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
                    <span>{site._count.pages} page{site._count.pages === 1 ? "" : "s"}</span>
                    <span>{new Date(site.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <TrashPanel />
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-10 text-xs text-fg-subtle">
        Neuravex runs locally on your machine. Data is stored in <code className="text-fg-muted">prisma/dev.db</code>.
      </footer>
    </div>
  );
}
