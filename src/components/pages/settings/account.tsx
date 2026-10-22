"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { signOut } from "@/components/app/account-menu";

/** change your own password; sign out */
export function AccountSettings() {
  const me = useMe();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) return toast.error("Use at least 8 characters for the new password.");
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (error) return toast.error(error.status === 400 || error.status === 401 ? "Your current password isn't right." : "Couldn't change the password. Try again.");
    setCurrent("");
    setNext("");
    await fetch("/api/me/password-changed", { method: "POST" }).catch(() => {});
    toast.success("Password changed", { description: "You've been signed out on your other devices." });
  }

  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="text-[13.5px] text-muted">
        Signed in as <span className="font-medium text-text">{me?.email}</span>
      </p>
      <form onSubmit={save} className="mt-4 grid max-w-md gap-3">
        <Field label="Current password" htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="pw-new" hint="At least 8 characters.">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" disabled={busy || !current || !next}>
            {busy && <Loader2 className="animate-spin" />} Change password
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
