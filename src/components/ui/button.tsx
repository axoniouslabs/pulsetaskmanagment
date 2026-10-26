import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 ease-[var(--ease-standard)] active:scale-[0.98] active:duration-75 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink-soft shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(15_61_71/0.18)]",
        secondary: "border border-line-strong bg-surface text-text hover:border-ink/40 hover:bg-sunken",
        ghost: "text-muted hover:bg-sunken hover:text-text",
        ok: "bg-ok text-white hover:brightness-110",
        danger: "border border-heat-3/30 bg-surface text-heat-3 hover:bg-heat-3-tint",
        dangerSolid: "bg-heat-3 text-white hover:brightness-110",
        link: "h-auto px-0 text-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 [&_svg]:size-[18px]",
        iconSm: "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
