"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";
import { changeMyPassword } from "./actions";
import { useApp, useMe } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/primitives";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { signOut } from "@/components/app/account-menu";

/** change your own password; sign out */
export function AccountSettings() {
  const me = useMe();
  const theme = useThemePref();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) return toast.error("Use at least 8 characters for the new password.");
    setBusy(true);
    const r = await changeMyPassword(current, next).catch(() => ({ ok: false as const, error: "Couldn't change the password. Try again." }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setCurrent("");
    setNext("");
    void useApp.getState().load();
    toast.success("Password changed", { description: "You've been signed out on your other devices." });
  }

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="mb-5 flex flex-col gap-2 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[14px] font-medium text-text">Appearance</p>
          <p className="text-[12.5px] text-muted">Dark mode is easier on the eyes at night. &quot;Device&quot; follows your phone or PC.</p>
        </div>
        <Segmented<ThemePref>
          value={theme}
          onChange={setThemePref}
          options={[
            { value: "system", label: "Device" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
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
