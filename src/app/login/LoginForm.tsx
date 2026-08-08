"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next") ?? "/";
  // Prevent open redirects — only allow relative paths
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(next);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Login failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-bg-border bg-bg-card p-8">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 mb-4" />
      <h1 className="text-lg font-semibold">Neuravex</h1>
      <p className="text-sm text-fg-muted mt-1">Enter your password to access the builder.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="pw">Password</Label>
          <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus placeholder="Enter password" />
        </div>
        {error ? <div className="text-red-400 text-xs">{error}</div> : null}
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="text-xs text-fg-subtle mt-4">
        Set <code className="text-fg-muted">AUTH_PASSWORD</code> in <code className="text-fg-muted">.env</code> to configure your password.
      </p>
    </div>
  );
}
