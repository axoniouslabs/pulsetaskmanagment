"use client";

import { FileText, ImageIcon } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";

/** a real preview for uploaded photos, a tinted tile for files and old sample data */
export function AttachmentThumb({ a, className, iconSize = "size-6" }: { a: Attachment; className?: string; iconSize?: string }) {
  if (a.url && a.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt={a.name} loading="lazy" className={cn("aspect-[4/3] w-full bg-sunken object-cover", className)} />;
  }
  return (
    <span
      className={cn("flex aspect-[4/3] w-full items-center justify-center", className)}
      style={{ background: a.kind === "image" ? `linear-gradient(135deg, oklch(0.9 0.05 ${a.hue ?? 200}), oklch(0.8 0.07 ${(a.hue ?? 200) + 40}))` : "var(--color-sunken)" }}
    >
      {a.kind === "image" ? <ImageIcon className={cn(iconSize, "text-white/90")} /> : <FileText className={cn(iconSize, "text-muted")} />}
    </span>
  );
}
