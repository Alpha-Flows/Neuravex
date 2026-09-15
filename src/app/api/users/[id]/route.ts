import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, hashPassword, verifyPasswordHash } from "@/lib/security";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

interface Params {
  params: { id: string };
}

// DELETE /api/users/[id] — remove a teammate. Guards against locking
// everyone out: you can't remove yourself, and you can't remove the last
// remaining account.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const currentUserId = await getSessionUserId();
  if (!currentUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (params.id === currentUserId) {
    return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 });
  }

  const count = await prisma.user.count();
  if (count <= 1) {
    return NextResponse.json({ error: "Can't remove the last remaining account" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

// PATCH /api/users/[id] — change your own password. Requires the current
// password; only works on your own account (flat access still means no one
// else's password can be reset without knowing it).
export async function PATCH(req: NextRequest, { params }: Params) {
  const currentUserId = await getSessionUserId();
  if (!currentUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (params.id !== currentUserId) {
    return NextResponse.json({ error: "You can only change your own password" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword: string = (body.currentPassword ?? "").toString();
  const newPassword: string = (body.newPassword ?? "").toString();

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: currentUserId } });
  if (!user || !verifyPasswordHash(currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: currentUserId },
    data: { passwordHash: hashPassword(newPassword) },
  });
  return NextResponse.json({ ok: true });
}
