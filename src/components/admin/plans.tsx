"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { cn } from "@/lib/utils";
import { savePlan } from "@/app/admin/actions";
import { PageTitle } from "./bits";

type Plan = { id: string; name: string; maxUsers: number | null; priceMonthly: number | null; archived: boolean; companies: number };

export function PlansEditor({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  return (
    <>
      <PageTitle
        title="Plans"
        sub="What companies can buy. Each plan sets how many active people a company can have and its monthly price. Changing a price doesn't touch payments already recorded."
        action={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus /> Add a plan
            </Button>
          )
        }
      />
      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_140px_160px_120px_110px] gap-3 border-b border-line px-5 py-2.5 text-[12.5px] font-medium text-faint md:grid">
          <span>Name</span>
          <span>People allowed</span>
          <span>Price a month (Rs)</span>
          <span>Companies</span>
          <span />
        </div>
        {adding && <PlanRow plan={{ id: "", name: "", maxUsers: 10, priceMonthly: null, archived: false, companies: 0 }} onSaved={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} />}
        {plans.map((p) => (
          <PlanRow key={p.id} plan={p} onSaved={() => router.refresh()} />
        ))}
      </Panel>
      <p className="mt-3 text-[13px] text-faint">Leave “People allowed” empty for no limit. Retired plans stay with the companies already on them but can&apos;t be picked for new ones.</p>
    </>
  );
}

function PlanRow({ plan, onSaved, onCancel }: { plan: Plan; onSaved: () => void; onCancel?: () => void }) {
  const [name, setName] = React.useState(plan.name);
  const [max, setMax] = React.useState(plan.maxUsers === null ? "" : String(plan.maxUsers));
  const [price, setPrice] = React.useState(plan.priceMonthly === null ? "" : String(plan.priceMonthly));
  const [archived, setArchived] = React.useState(plan.archived);
  const [busy, setBusy] = React.useState(false);
  const dirty = name !== plan.name || max !== (plan.maxUsers === null ? "" : String(plan.maxUsers)) || price !== (plan.priceMonthly === null ? "" : String(plan.priceMonthly)) || archived !== plan.archived || !plan.id;

  async function save() {
    setBusy(true);
    const r = await savePlan({ id: plan.id || undefined, name, maxUsers: max.trim() === "" ? null : Number(max), priceMonthly: price.trim() === "" ? null : Number(price), archived }).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(plan.id ? "Plan saved" : "Plan added");
    onSaved();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className={cn("grid gap-3 border-b border-line px-5 py-3.5 last:border-0 md:grid-cols-[minmax(0,1.4fr)_140px_160px_120px_110px] md:items-center", archived && "bg-sunken/40", !plan.id && "bg-ink-tint/30")}
    >
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-faint md:sr-only">Name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name" autoFocus={!plan.id} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-faint md:sr-only">People allowed</span>
        <Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} placeholder="No limit" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-faint md:sr-only">Price a month (Rs)</span>
        <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Not set" />
      </label>
      <div className="flex items-center gap-3 text-[13.5px] text-muted">
        <span className="tabular">{plan.id ? `${plan.companies} ${plan.companies === 1 ? "company" : "companies"}` : "New"}</span>
        {plan.id && (
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <Checkbox checked={archived} onCheckedChange={(v) => setArchived(v === true)} /> Retired
          </label>
        )}
      </div>
      <div className="flex gap-2 md:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" variant={dirty ? "primary" : "secondary"} disabled={busy || !dirty || !name.trim()}>
          {busy && <Loader2 className="animate-spin" />} {plan.id ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}
