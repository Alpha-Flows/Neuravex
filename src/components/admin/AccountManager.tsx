"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";

interface UserRow {
  id: string;
  email: string;
  createdAt: string;
}

interface Props {
  currentUserId: string;
  initialUsers: UserRow[];
}

export function AccountManager({ currentUserId, initialUsers }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>(initialUsers);

  // Add teammate
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // Remove teammate
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");

  // Change own password
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAdding(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(data.error || "Could not add teammate");
        return;
      }
      setUsers((prev) => [...prev, data]);
      setNewEmail("");
      setNewPassword("");
    } finally {
      setAdding(false);
    }
  }

  async function removeUser(id: string) {
    if (!confirm("Remove this teammate's account? They'll be signed out immediately.")) return;
    setRemoveError("");
    setRemovingId(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRemoveError(data.error || "Could not remove teammate");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setRemovingId(null);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    setChangingPw(true);
    try {
      const res = await fetch(`/api/users/${currentUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword: nextPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data.error || "Could not change password");
        return;
      }
      setCurrentPassword("");
      setNextPassword("");
      setPwSuccess(true);
    } finally {
      setChangingPw(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const canRemoveAnyone = users.length > 1;

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-4">Teammates</h2>
        <div className="space-y-2 mb-5">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-bg-border bg-bg p-3 text-sm">
              <div>
                <div className="text-fg">
                  {u.email}
                  {u.id === currentUserId ? <span className="text-fg-subtle"> (you)</span> : null}
                </div>
                <div className="text-fg-subtle text-xs">Added {new Date(u.createdAt).toLocaleDateString()}</div>
              </div>
              {u.id !== currentUserId && canRemoveAnyone ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => removeUser(u.id)}
                  loading={removingId === u.id}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {removeError ? <div className="text-red-400 text-xs mb-3">{removeError}</div> : null}

        <form onSubmit={addUser} className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="new-email">Add teammate — email</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="teammate@example.com"
              required
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" loading={adding}>
            Add
          </Button>
        </form>
        {addError ? <div className="text-red-400 text-xs mt-2">{addError}</div> : null}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-4">Change your password</h2>
        <form onSubmit={changePassword} className="space-y-3 max-w-sm">
          <div>
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <Label htmlFor="next-password">New password</Label>
            <Input
              id="next-password"
              type="password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
          </div>
          {pwError ? <div className="text-red-400 text-xs">{pwError}</div> : null}
          {pwSuccess ? <div className="text-emerald-400 text-xs">Password updated.</div> : null}
          <Button type="submit" loading={changingPw}>
            Update password
          </Button>
        </form>
      </Card>

      <div>
        <Button variant="outline" onClick={signOut} loading={signingOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
