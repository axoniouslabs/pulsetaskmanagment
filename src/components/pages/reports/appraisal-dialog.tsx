"use client";

import { Printer } from "lucide-react";
import { cn, plural } from "@/lib/utils";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/primitives";
import { addTotals, emptyTotals, hoursLabel, METRICS, ratesOf, timeSplit, type PersonRow, type Rates } from "./metrics";
import { ackBaselines } from "./people-table";
import { printAppraisal } from "./print-style";

function summarise(r: PersonRow, team: Rates, ackBase: number | null) {
  const first = r.person.name.split(" ")[0];
  const t = r.totals;
  const out: string[] = [];
  if (!t.assigned) return [`${first} had no tasks assigned in this period.`];
  out.push(
    `${first} finished ${t.approved} of ${plural(t.assigned, "task")} (${Math.round(r.rates.completion ?? 0)}%), worth about ${Math.round(t.estHours)} hours of estimated work, and ${Math.round(r.rates.onTime ?? 0)}% of them were on time.`,
  );
  if (r.rates.ack !== null) {
    const kind = r.person.workType === "field" ? "field staff" : "desk staff";
    const vs = ackBase === null ? "" : r.rates.ack <= ackBase * 0.9 ? `, faster than other ${kind}` : r.rates.ack >= ackBase * 1.3 ? `, slower than other ${kind}` : `, in line with other ${kind}`;
    out.push(`New tasks were usually acknowledged within ${Math.round(r.rates.ack)} minutes${vs}, and ${Math.round(r.rates.firstReminder ?? 0)}% were answered at the first reminder.`);
  }
  if (t.rejections) out.push(`${plural(t.rejections, "submission was", "submissions were")} sent back for changes (${Math.round(r.rates.rework ?? 0)}% rework).`);
  else out.push("Nothing was sent back for changes.");
  out.push(t.escalations ? `Escalation was needed ${plural(t.escalations, "time")}.` : "No task had to be escalated.");
  const strong = (r.rates.completion ?? 0) >= (team.completion ?? 0) && (r.rates.onTime ?? 0) >= (team.onTime ?? 0);
  const weak = (r.rates.onTime ?? 100) < 70 || t.escalations >= 4;
  out.push(
    strong
      ? "Overall, above the team average on both completion and punctuality."
      : weak
        ? "Overall, deadlines and responsiveness are the areas to discuss."
        : "Overall, close to the team average.",
  );
  return out;
}

export function AppraisalDialog({
  row,
  allRows,
  periodLabel,
  rangeLabel,
  onOpenChange,
}: {
  row: PersonRow | null;
  allRows: PersonRow[];
  periodLabel: string;
  rangeLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const teamTotals = allRows.reduce((acc, r) => addTotals(acc, r.totals), emptyTotals());
  const team = ratesOf(teamTotals);
  const base = ackBaselines(allRows);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      {row && (
        <DialogContent wide title={`Appraisal report: ${row.person.name}`} description={`${periodLabel}, ${rangeLabel}. Generated from Pulse records, which nobody can edit.`}>
          <div className="flex items-center gap-3">
            <Avatar person={row.person} size="lg" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{row.person.name}</p>
              <p className="text-[13px] text-muted">
                {row.person.title}, {row.person.workType === "field" ? "field staff" : "desk staff"}
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[var(--radius-md)] border border-line">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-hover text-[12.5px] text-muted">
                  <th className="px-3 py-2 text-left font-medium">Measure</th>
                  <th className="px-3 py-2 text-right font-medium">{row.person.name.split(" ")[0]}</th>
                  <th className="px-3 py-2 text-right font-medium">Team average</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const mine = row.rates[m.key];
                  const avg = m.key === "escalations" ? (allRows.length ? team.escalations / allRows.length : null) : team[m.key];
                  const worse = mine !== null && avg !== null && (m.better === "up" ? mine < avg - m.threshold * 2 : mine > avg + m.threshold * 2);
                  return (
                    <tr key={m.key} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        {m.label}
                        <span className="block text-[12px] text-faint">{m.hint}</span>
                      </td>
                      <td className={cn("tabular px-3 py-2 text-right font-medium", worse && "text-heat-2")}>{m.format(mine)}</td>
                      <td className="tabular px-3 py-2 text-right text-muted">{m.key === "escalations" ? (avg === null ? "–" : avg.toFixed(1)) : m.format(avg)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="px-3 py-2">
                    Weighted volume
                    <span className="block text-[12px] text-faint">Estimated hours of work assigned</span>
                  </td>
                  <td className="tabular px-3 py-2 text-right font-medium">{Math.round(row.rates.volume)}h</td>
                  <td className="tabular px-3 py-2 text-right text-muted">{allRows.length ? Math.round(team.volume / allRows.length) : 0}h</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="mt-5 text-[14px] font-semibold">Summary</h3>
          <div className="mt-1.5 space-y-1.5 text-[14px] leading-relaxed text-text">
            {summarise(row, team, base[row.person.workType]).map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Typical cycle per task: about {hoursLabel(timeSplit(row.totals).total)} from assignment to approval. Blocked time counts against the blocker, not {row.person.name.split(" ")[0]}.
          </p>

          <div className="mt-6 flex justify-end gap-2 print:hidden">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={printAppraisal}>
              <Printer /> Print
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
