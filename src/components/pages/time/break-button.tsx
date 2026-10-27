"use client";

import { toast } from "sonner";
import { Coffee } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";

export function BreakButton({ onBreak }: { onBreak: boolean }) {
  const act = useApp((s) => s.act);
  return (
    <Button
      variant={onBreak ? "secondary" : "ghost"}
      size="sm"
      onClick={() => {
        if (onBreak) {
          if (act({ type: "endBreak" }).ok) toast.success("Welcome back", { description: "Start your timer again when you pick the work up." });
        } else if (act({ type: "startBreak" }).ok) toast("On a break", { description: "Your timer is paused. Tap Back when you return." });
      }}
    >
      <Coffee /> {onBreak ? "Back from break" : "Take a break"}
    </Button>
  );
}
