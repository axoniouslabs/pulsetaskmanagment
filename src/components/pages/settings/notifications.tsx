"use client";

import { toast } from "sonner";
import { Lock } from "lucide-react";
import { useApp } from "@/lib/store";
import { Checkbox, Tip } from "@/components/ui/primitives";

type ChannelKey = "push" | "inapp" | "email";

const CHANNELS: { key: ChannelKey; label: string; short: string }[] = [
  { key: "push", label: "Phone & PC push", short: "Push" },
  { key: "inapp", label: "In-app", short: "In-app" },
  { key: "email", label: "Email", short: "Email" },
];

const CATEGORIES: { key: string; label: string; hint?: string; locked?: boolean }[] = [
  { key: "assigned", label: "New task", hint: "Someone assigns you work" },
  { key: "reminder", label: "Reminders", hint: "Until you acknowledge" },
  { key: "escalation", label: "Escalations", hint: "Work you are accountable for", locked: true },
  { key: "blocked", label: "Blocked", hint: "Someone is waiting on you" },
  { key: "submitted", label: "Submitted for review" },
  { key: "review", label: "Approved or sent back" },
  { key: "mention", label: "Mentions" },
  { key: "announcement", label: "Notices", hint: "Including ones that need your OK", locked: true },
  { key: "digest", label: "Digests", hint: "Morning brief and evening summary" },
];

const defaultOn = (cat: string, ch: ChannelKey) => (ch === "email" ? cat === "digest" : true);

/** what reaches the current user, and where */
export function NotificationMatrix() {
  const meId = useApp((s) => s.userIds[s.role]);
  const mine = useApp((s) => s.prefs[meId]);
  const setPref = useApp((s) => s.setPref);
  const get = (cat: string, ch: ChannelKey) => mine?.[`${ch}:${cat}`] ?? defaultOn(cat, ch);

  return (
    <>
      <div className="thin-scrollbar overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th scope="col" className="px-4 py-2.5 text-left font-medium sm:px-5">
                Notify me about
              </th>
              {CHANNELS.map((c) => (
                <th key={c.key} scope="col" className="w-14 px-1 py-2.5 text-center font-medium sm:w-32">
                  <span className="sm:hidden">{c.short}</span>
                  <span className="hidden sm:inline">{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat.key} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left font-normal sm:px-5">
                  <span className="flex items-center gap-1.5 font-medium text-text">
                    {cat.label}
                    {cat.locked && <Lock className="size-3.5 text-faint" aria-label="Always on" />}
                  </span>
                  {cat.hint && <span className="block text-[12px] text-muted">{cat.hint}</span>}
                </th>
                {CHANNELS.map((ch) => {
                  const emailBlocked = ch.key === "email" && cat.key !== "digest";
                  const locked = cat.locked && ch.key !== "email";
                  return (
                    <td key={ch.key} className="px-1 py-3 text-center">
                      {emailBlocked ? (
                        <Tip label="Email is only used for digests, so it never replaces a reminder you need to act on.">
                          <span className="inline-flex size-10 items-center justify-center text-faint" aria-label={`${ch.label} not available for ${cat.label}`}>
                            –
                          </span>
                        </Tip>
                      ) : locked ? (
                        <Tip label="Always on. You can't switch off accountability notifications addressed to you.">
                          <span className="inline-flex size-10 items-center justify-center text-muted" aria-label={`${cat.label} by ${ch.label}: always on`}>
                            <Lock className="size-4" />
                          </span>
                        </Tip>
                      ) : (
                        <label className="inline-flex size-10 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] hover:bg-sunken">
                          <Checkbox
                            checked={get(cat.key, ch.key)}
                            aria-label={`${cat.label} by ${ch.label}`}
                            onCheckedChange={(v) => {
                              setPref(`${ch.key}:${cat.key}`, v === true);
                              toast.success("Saved", { id: "settings-saved", duration: 1600 });
                            }}
                          />
                        </label>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-[12.5px] leading-snug text-muted sm:px-5">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        You can&apos;t switch off accountability notifications addressed to you. Escalations and notices that need your OK always arrive by push and in-app.
      </p>
    </>
  );
}
