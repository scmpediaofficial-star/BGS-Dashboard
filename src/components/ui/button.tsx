import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-[background,color,box-shadow,transform,border-color] duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-card hover:bg-primary-hover",
        accent: "bg-accent text-accent-fg shadow-card hover:bg-accent-hover",
        gold: "bg-gold text-[#16163f] shadow-card hover:brightness-95",
        secondary: "bg-surface-3 text-ink hover:bg-line-strong/60",
        outline: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
        danger: "bg-critical text-white shadow-card hover:brightness-95",
        "danger-ghost": "text-critical-ink hover:bg-critical-soft",
        link: "h-auto rounded-none p-0 text-accent-ink underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-8 px-3 text-[12.5px] [&_svg]:size-3.5",
        md: "h-9.5 px-4 text-[13px] [&_svg]:size-4",
        lg: "h-11 px-5 text-sm [&_svg]:size-[18px]",
        icon: "size-9 [&_svg]:size-[18px]",
        "icon-sm": "size-8 rounded-lg [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? children : (
        <>
          {loading && <LoaderCircle className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
