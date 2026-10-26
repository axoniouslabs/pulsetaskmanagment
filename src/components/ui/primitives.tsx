"use client";

import * as React from "react";
import {
  Dialog as D,
  DropdownMenu as DM,
  Popover as PO,
  Tooltip as TT,
  Switch as SW,
  Checkbox as CB,
} from "radix-ui";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { m } from "motion/react";
import { GLIDE } from "@/lib/motion";

/* ---------------- Dialog: centred on desktop, bottom sheet on phones ---------------- */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
  hideClose,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
  hideClose?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="motion-overlay fixed inset-0 z-50 bg-ink/25 backdrop-blur-[3px]" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-pop outline-none",
          "motion-dialog inset-x-0 bottom-0 rounded-t-[var(--radius-xl)]",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[7vh] sm:max-h-[86dvh] sm:w-full sm:-translate-x-1/2 sm:rounded-[var(--radius-lg)]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <D.Title className="font-display text-[19px] font-semibold text-text">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-[13.5px] leading-snug text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close className="press -mr-1.5 -mt-0.5 rounded-[var(--radius-sm)] p-1.5 text-faint hover:bg-sunken hover:text-text" aria-label="Close">
              <X className="size-[18px]" />
            </D.Close>
          )}
        </div>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/* ---------------- Side sheet: right panel on desktop, full screen on phones ---------------- */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  header,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
  header?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="motion-overlay fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]" />
        <D.Content
          className="motion-sheet fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-surface shadow-sheet outline-none md:w-[min(640px,92vw)]"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">{title}</D.Title>
          {header}
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export const SheetClose = D.Close;

/* ---------------- Dropdown ---------------- */
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn(
          "motion-menu z-50 min-w-48 rounded-[var(--radius-md)] border border-line bg-surface p-1 shadow-pop",
          className,
        )}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}
export function MenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13.5px] text-text outline-none transition-colors duration-100 data-[highlighted]:bg-sunken data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}
export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <DM.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-faint">{children}</DM.Label>
);

/* ---------------- Popover ---------------- */
export const Popover = PO.Root;
export const PopoverTrigger = PO.Trigger;
export function PopoverContent({ children, className, align = "end" }: { children: React.ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <PO.Portal>
      <PO.Content
        align={align}
        sideOffset={8}
        collisionPadding={12}
        className={cn("motion-menu z-50 rounded-[var(--radius-lg)] border border-line bg-surface shadow-pop outline-none", className)}
      >
        {children}
      </PO.Content>
    </PO.Portal>
  );
}

/* ---------------- Tooltip ---------------- */
export const TooltipProvider = TT.Provider;
export function Tip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TT.Root delayDuration={250}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="motion-tip z-[60] max-w-64 rounded-[var(--radius-sm)] bg-text px-2.5 py-1.5 text-xs leading-snug text-surface shadow-pop">
          {label}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

/* ---------------- Switch & checkbox ---------------- */
export function Switch({ className, ...props }: React.ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full bg-line-strong transition-colors duration-200 data-[state=checked]:bg-ink",
        className,
      )}
      {...props}
    >
      <SW.Thumb className="block size-[18px] translate-x-[2px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-[260ms] ease-[var(--ease-settle)] data-[state=checked]:translate-x-[18px]" />
    </SW.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CB.Root>) {
  return (
    <CB.Root
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-line-strong bg-surface transition-colors duration-150 hover:border-ink/50 data-[state=checked]:border-ok data-[state=checked]:bg-ok",
        className,
      )}
      {...props}
    >
      <CB.Indicator className="motion-check">
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </CB.Indicator>
    </CB.Root>
  );
}

/* ---------------- Inputs ---------------- */
export const fieldBase =
  "w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-[14px] text-text placeholder:text-faint transition-[border-color,box-shadow] duration-150 hover:border-ink/35 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/12";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldBase, "min-h-20 resize-y py-2.5 leading-relaxed", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldBase,
      "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b6b72%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-9",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({ label, hint, children, className, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string }) {
  // tie the label (and hint) to the control, so tapping the label focuses it and screen readers announce both
  const auto = React.useId();
  const hintId = `${auto}-hint`;
  let id = htmlFor;
  let control = children;
  if (React.isValidElement<{ id?: string; "aria-describedby"?: string }>(children) && (children.type === Input || children.type === Select || children.type === Textarea)) {
    id = children.props.id ?? htmlFor ?? auto;
    control = React.cloneElement(children, { id, "aria-describedby": hint ? [children.props["aria-describedby"], hintId].filter(Boolean).join(" ") : children.props["aria-describedby"] });
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-text">
        {label}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs leading-snug text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ---------------- Segmented control: the selection glides between options ---------------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
  size?: "sm" | "md";
}) {
  const id = React.useId();
  return (
    <div role="tablist" className={cn("inline-flex rounded-[var(--radius-sm)] bg-sunken p-0.5", className)}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors duration-150",
              on ? "text-text" : "text-muted hover:text-text",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
            )}
          >
            {on && (
              <m.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[5px] bg-surface shadow-[0_1px_2px_rgb(15_61_71/0.12),0_0_0_0.5px_rgb(15_61_71/0.04)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
                transition={GLIDE}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {o.label}
              {o.count !== undefined && <span className="tabular text-faint">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Progress ---------------- */
export function Bar({ value, max = 100, tone = "ink", className }: { value: number; max?: number; tone?: "ink" | "ok" | "heat-1" | "heat-2" | "heat-3"; className?: string }) {
  const pctv = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = { ink: "bg-ink", ok: "bg-ok", "heat-1": "bg-heat-1", "heat-2": "bg-heat-2", "heat-3": "bg-heat-3" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-[var(--ease-settle)]", color)} style={{ width: `${pctv}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted">{children}</kbd>;
}
