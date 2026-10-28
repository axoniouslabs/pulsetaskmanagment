"use client";

import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { renderSVG } from "uqr";
import { Copy, Laptop, Loader2, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";

interface SessionRow {
  id: string;
  token: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** "Chrome on Windows" from a user agent, good enough to recognise a device */
function deviceName(ua?: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** every place this account is signed in, with a way to sign any of them out */
export function SignedInDevices() {
  const { data: current } = authClient.useSession();
  const [rows, setRows] = React.useState<SessionRow[] | null>(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    authClient.listSessions().then((r) => live && setRows((r.data as SessionRow[] | null) ?? []));
    return () => {
      live = false;
    };
  }, [tick]);
  const refresh = () => setTick((n) => n + 1);
  const mine = current?.session.id;
  const [all, setAll] = React.useState(false);
  const sorted = [...(rows ?? [])].sort((a, b) => Number(b.id === mine) - Number(a.id === mine) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const shown = all ? sorted : sorted.slice(0, 5);

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-medium text-text">Signed in on</p>
        {sorted.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const r = await authClient.revokeOtherSessions();
              if (r.error) return toast.error("Couldn't sign the others out. Try again.");
              toast.success("Signed out everywhere else");
              refresh();
            }}
          >
            <LogOut /> Sign out everywhere else
          </Button>
        )}
      </div>
      {rows === null ? (
        <p className="mt-2 text-[13px] text-faint">Loading…</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-[var(--radius-md)] border border-line">
          {shown.map((s) => {
            const phone = /Android|iPhone|iPad/.test(s.userAgent ?? "");
            const Icon = phone ? Smartphone : Laptop;
            const here = s.id === mine;
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <Icon className="size-5 shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text">
                    {deviceName(s.userAgent)}
                    {here && <span className="ml-2 rounded-full bg-ok-tint px-2 py-0.5 text-[11.5px] font-medium text-ok">This device</span>}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    Active {formatDistanceToNowStrict(new Date(s.updatedAt), { addSuffix: true })}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  </span>
                </span>
                {!here && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const r = await authClient.revokeSession({ token: s.token });
                      if (r.error) return toast.error("Couldn't sign it out. Try again.");
                      toast.success(`${deviceName(s.userAgent)} signed out`);
                      refresh();
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!all && sorted.length > 5 && (
        <button type="button" onClick={() => setAll(true)} className="mt-2 text-[13px] font-medium text-ink hover:underline">
          Show all {sorted.length}
        </button>
      )}
      <p className="mt-2 text-[12.5px] text-muted">Don&apos;t recognise one? Sign it out, then change your password.</p>
    </div>
  );
}

/** optional two-step sign-in with an authenticator app (recommended for owners and managers) */
export function TwoStep({ recommended }: { recommended: boolean }) {
  const { data, refetch } = authClient.useSession();
  const enabled = !!(data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled;
  const [password, setPassword] = React.useState("");
  const [setup, setSetup] = React.useState<{ uri: string; codes: string[] } | null>(null);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await authClient.twoFactor.enable({ password, issuer: "Pulse" });
    setBusy(false);
    if (r.error || !r.data || !("totpURI" in r.data))
      return toast.error(r.error?.status === 429 ? "Too many tries. Wait a few minutes." : r.error?.status === 403 ? (r.error.message ?? "Not allowed.") : "That password isn't right.");
    setSetup({ uri: r.data.totpURI, codes: r.data.backupCodes });
    setPassword("");
  };
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") });
    setBusy(false);
    if (r.error) return toast.error("That code didn't match. Use the current code from the app.");
    toast.success("Two-step sign-in is on", { description: "New devices will ask for a code after your password." });
    setSetup(null);
    setCode("");
    void refetch();
  };
  const turnOff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (r.error) return toast.error("That password isn't right.");
    toast.success("Two-step sign-in is off");
    setPassword("");
    void refetch();
  };

  const secret = setup ? (new URL(setup.uri).searchParams.get("secret") ?? "") : "";

  return (
    <div className="border-t border-line px-4 py-4 sm:px-5">
      <p className="flex items-center gap-2 text-[14px] font-medium text-text">
        <ShieldCheck className="size-4 text-faint" /> Two-step sign-in
        {enabled && <span className="rounded-full bg-ok-tint px-2 py-0.5 text-[11.5px] font-medium text-ok">On</span>}
      </p>
      <p className="mt-0.5 max-w-[62ch] text-[12.5px] leading-snug text-muted">
        After your password, Pulse asks for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).
        {recommended && !enabled ? " Recommended for you: your account can see and change other people's work." : ""}
      </p>

      {setup ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div
            className="rounded-[var(--radius-md)] border border-line bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
            aria-label="QR code for your authenticator app"
            role="img"
            dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri) }}
          />
          <div className="space-y-3">
            <p className="text-[13.5px] text-text">1. Scan this with your authenticator app, or enter this key:</p>
            <p className="break-all font-mono text-[13px] tracking-wider text-muted">{secret}</p>
            <p className="text-[13.5px] text-text">2. Save these backup codes somewhere safe. Each works once if you lose your phone.</p>
            <div className="flex flex-wrap items-start gap-2">
              <pre className="rounded-[var(--radius-sm)] bg-sunken px-3 py-2 font-mono text-[12.5px] leading-relaxed">{setup.codes.join("\n")}</pre>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  navigator.clipboard
                    .writeText(setup.codes.join("\n"))
                    .then(() => toast.success("Backup codes copied"))
                    .catch(() => toast.error("Couldn't copy. Select them and copy instead."))
                }
              >
                <Copy /> Copy
              </Button>
            </div>
            <form onSubmit={confirm} className="flex flex-wrap items-end gap-2">
              <Field label="3. Enter the code the app shows" htmlFor="tf-code">
                <Input id="tf-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className="w-40 font-mono tracking-[0.3em]" maxLength={8} />
              </Field>
              <Button type="submit" variant="primary" disabled={busy || code.replace(/\s+/g, "").length < 6}>
                {busy && <Loader2 className="animate-spin" />} Turn on
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <form onSubmit={enabled ? turnOff : start} className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Your password" htmlFor="tf-pw">
            <Input id="tf-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-56" />
          </Field>
          <Button type="submit" variant={enabled ? "secondary" : "primary"} disabled={busy || !password}>
            {busy && <Loader2 className="animate-spin" />} {enabled ? "Turn off" : "Set up"}
          </Button>
        </form>
      )}
    </div>
  );
}
