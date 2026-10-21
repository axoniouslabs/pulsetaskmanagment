"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/primitives";
import { judge, METRICS, type Rates } from "./metrics";

/** a compact row of headline figures, each with a quiet trend */
export function MetricStrip({ cur, prev, trendCur, note }: { cur: Rates; prev: Rates; trendCur: Rates; note: string }) {
  return (
    <section aria-label="Headline numbers">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6 print:grid-cols-6">
        {METRICS.map((m) => {
          const { diff, tone } = judge(m, trendCur[m.key], prev[m.key]);
          const up = diff > 0;
          const Icon = tone === "none" || tone === "flat" ? Minus : up ? ArrowUpRight : ArrowDownRight;
          return (
            <div key={m.key} className="bg-surface px-4 py-3.5">
              <Tip label={m.hint}>
                <p className="w-fit cursor-help text-[12.5px] leading-tight text-muted">{m.label}</p>
              </Tip>
              <p className="tabular mt-1.5 font-display text-[24px] font-semibold leading-none text-text">{m.format(cur[m.key])}</p>
              <p
                className={cn(
                  "mt-1.5 flex items-center gap-1 text-[12px]",
                  tone === "better" && "text-ok",
                  tone === "worse" && "font-medium text-heat-2",
                  (tone === "flat" || tone === "none") && "text-faint",
                )}
              >
                <Icon className="size-3.5" />
                {tone === "none" ? "No earlier data" : tone === "flat" ? "Steady" : m.delta(diff)}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-faint">{note}</p>
    </section>
  );
}
