"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileUp } from "lucide-react";
import { useApp } from "@/lib/store";
import { useScope } from "@/lib/hooks";
import type { Priority } from "@/lib/types";
import type { NewTaskInput } from "@/domain/commands";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/primitives";

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const SAMPLE = `title,assignee,due,priority,estimate_hours,description,checklist,proof_photo
Count stock in rack B,rabia@crescent.pk,2026-11-02 17:00,high,2,Count every carton including damaged ones,Count;Take photo;Update sheet,yes
Call 10 pending dealers,Ayesha Siddiqui,2026-11-03,normal,3,,,no
`;

interface Row {
  line: number;
  input?: NewTaskInput;
  error?: string;
  title: string;
  who?: string;
}

function parseDue(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})\s*(am|pm)?)?$/i);
  if (m) {
    let h = m[4] ? Number(m[4]) : 17;
    const min = m[5] ? Number(m[5]) : 0;
    if (m[6]) h = (h % 12) + (m[6].toLowerCase() === "pm" ? 12 : 0);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ImportBody onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ImportBody({ onDone }: { onDone: () => void }) {
  const { people: scope, role, meId } = useScope();
  const allPeople = useApp((s) => s.people);
  const createTask = useApp((s) => s.createTask);
  const settings = useApp((s) => s.settings);
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [fileName, setFileName] = React.useState("");

  const assignable = React.useMemo(() => (role === "owner" ? allPeople.filter((p) => p.role !== "owner" && p.active !== false) : scope.filter((p) => p.id !== meId || role === "employee")), [role, allPeople, scope, meId]);

  const read = async (file: File) => {
    setFileName(file.name);
    const table = parseCsv(await file.text());
    if (table.length < 2) return setRows([]);
    const head = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const col = (row: string[], ...names: string[]) => {
      for (const n of names) {
        const i = head.indexOf(n);
        if (i >= 0) return (row[i] ?? "").trim();
      }
      return "";
    };
    const out: Row[] = table.slice(1).map((r, idx) => {
      const line = idx + 2;
      const title = col(r, "title", "task");
      const who = col(r, "assignee", "owner", "email", "assigned_to");
      if (!title) return { line, title: "(no title)", error: "Title is empty." };
      const person = assignable.find((p) => p.email.toLowerCase() === who.toLowerCase() || p.name.toLowerCase() === who.toLowerCase() || p.name.split(" ")[0].toLowerCase() === who.toLowerCase());
      if (!person) return { line, title, who, error: who ? `"${who}" isn't someone you can assign to.` : "Assignee is empty." };
      const due = parseDue(col(r, "due", "deadline", "due_date"));
      if (!due) return { line, title, who: person.name, error: "Deadline missing or not a date (use 2026-11-02 17:00)." };
      const pr = col(r, "priority").toLowerCase();
      const priority: Priority = (["urgent", "high", "normal", "low"] as Priority[]).includes(pr as Priority) ? (pr as Priority) : "normal";
      const est = Number(col(r, "estimate_hours", "estimate", "hours"));
      const proof = /^(y|yes|true|1)$/i.test(col(r, "proof_photo", "proof"));
      return {
        line,
        title,
        who: person.name,
        input: {
          title,
          assigneeId: person.id,
          dueAt: due.toISOString(),
          priority,
          estimateHours: est > 0 ? est : 1,
          description: col(r, "description", "instructions"),
          subtasks: col(r, "checklist", "steps").split(/;|\|/).map((x) => x.trim()).filter(Boolean),
          requiresProof: proof,
          requiresApproval: settings.approvalByDefault,
        },
      };
    });
    setRows(out);
  };

  const valid = rows?.filter((r) => r.input) ?? [];
  const bad = rows?.filter((r) => r.error) ?? [];

  const run = () => {
    let ok = 0;
    for (const r of valid) if (createTask(r.input!)) ok++;
    toast.success(`Imported ${ok} task${ok === 1 ? "" : "s"}`, { description: "Everyone has been told and reminders start on schedule." });
    onDone();
  };

  const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`;

  return (
    <DialogContent title="Import tasks from a spreadsheet" description="Save your sheet as CSV. Each row becomes one task for one person, with the company's default reminders." wide>
      {!rows ? (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed border-line-strong px-6 py-10 text-center hover:border-ink/40">
            <FileUp className="size-7 text-ink" />
            <span className="text-[14.5px] font-semibold">Choose a CSV file</span>
            <span className="text-[13px] text-muted">Columns: title, assignee (email or name), due, priority, estimate_hours, description, checklist (steps separated by ;), proof_photo (yes/no)</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          </label>
          <a href={sampleHref} download="pulse-import-sample.csv" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            <Download /> Download a sample file
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13.5px] text-muted">
            <span className="font-medium text-text">{fileName}</span>: {valid.length} ready{bad.length ? `, ${bad.length} need fixing` : ""}.
          </p>
          <div className="thin-scrollbar max-h-[320px] overflow-y-auto rounded-[var(--radius-md)] border border-line">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-sunken text-left text-[12px] text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t border-line align-top">
                    <td className="tabular px-3 py-2 text-faint">{r.line}</td>
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2 text-muted">{r.who ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.error ? (
                        <span className="inline-flex items-start gap-1 text-heat-3">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {r.error}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-ok">
                          <CheckCircle2 className="size-3.5" /> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bad.length > 0 && <p className="text-[12.5px] text-muted">Rows that need fixing are skipped. Fix them in the sheet and import again.</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setRows(null)}>Choose another file</Button>
            <Button variant="primary" onClick={run} disabled={!valid.length}>
              Import {valid.length} task{valid.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}
