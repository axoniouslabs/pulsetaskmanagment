"use client";

import { describeRule } from "@/domain/repeat";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";

/** saved task templates; anyone who made one (and the owner) can remove it */
export function TemplateList() {
  const templates = useApp((s) => s.templates);
  const people = useApp((s) => s.people);
  const role = useApp((s) => s.role);
  const meId = useApp((s) => s.viewer?.personId);
  const dispatch = useApp((s) => s.dispatch);
  if (!templates.length)
    return <p className="px-4 py-4 text-[13.5px] text-muted sm:px-5">No templates yet. Fill in New task, then press Save as template for work you assign again and again.</p>;
  return (
    <ul>
      {templates.map((t) => (
        <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{t.name}</p>
            <p className="truncate text-[12.5px] text-muted">
              {t.input.title}
              {t.input.repeat ? `, ${describeRule(t.input.repeat).toLowerCase()}` : t.input.recurrence ? `, repeats ${t.input.recurrence}` : ""}
              {t.input.subtasks?.length ? `, ${t.input.subtasks.length} steps` : ""} · by {people.find((p) => p.id === t.createdById)?.name.split(" ")[0] ?? "someone"}
            </p>
          </div>
          {(role === "owner" || t.createdById === meId) && (
            <Button
              size="iconSm"
              variant="ghost"
              aria-label={`Delete ${t.name}`}
              onClick={() => {
                const r = dispatch({ type: "deleteTemplate", id: t.id });
                if (r.ok) toast("Template deleted", { description: t.name });
                else toast.error(r.error);
              }}
            >
              <Trash2 />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
