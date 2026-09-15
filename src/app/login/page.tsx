import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const userCount = await prisma.user.count();

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <Suspense>
        <LoginForm isSetup={userCount === 0} />
      </Suspense>
    </div>
  );
}
