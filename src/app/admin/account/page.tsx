import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/security";
import { AccountManager } from "@/components/admin/AccountManager";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const currentUserId = await getSessionUserId();
  if (!currentUserId) redirect("/login");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, createdAt: true },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-bg-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500" />
            <span className="font-semibold">Neuravex</span>
          </div>
          <Link href="/" className="text-sm text-fg-muted hover:text-fg">
            ← Sites
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-1">Account</h1>
        <p className="text-fg-muted mb-8">
          Everyone with an account here can see and edit every site — there are no per-site permissions.
        </p>
        <AccountManager
          currentUserId={currentUserId}
          initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        />
      </main>
    </div>
  );
}
