"use client";

import * as React from "react";
import { format } from "date-fns";
import { FileDown } from "lucide-react";

/** the nightly copies Pulse keeps, newest first */
export function BackupList() {
  const [rows, setRows] = React.useState<{ id: string; at: string; size: number }[] | null>(null);
  React.useEffect(() => {
    let live = true;
    fetch("/api/backups", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setRows(d?.backups ?? []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);
  if (rows === null) return <p className="text-[13px] text-faint">Loading backups…</p>;
  if (!rows.length) return <p className="text-[13px] text-muted">The first nightly backup is made within a day.</p>;
  return (
    <ul className="w-full divide-y divide-line rounded-[var(--radius-md)] border border-line sm:w-80">
      {rows.slice(0, 7).map((b) => (
        <li key={b.id}>
          <a href={`/api/backups/${b.id}`} download className="flex items-center gap-2 px-3 py-2 text-[13.5px] hover:bg-hover">
            <FileDown className="size-4 text-faint" />
            <span className="flex-1 text-text">{format(new Date(b.at), "EEE d MMM, h:mm a")}</span>
            <span className="tabular text-[12px] text-faint">{Math.max(1, Math.round(b.size / 1024))} KB</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
