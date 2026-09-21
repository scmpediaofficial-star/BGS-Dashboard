import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-card border border-line bg-surface shadow-card", className)} {...props} />;
}

type CardHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

export function CardHeader({ title, description, action, className, ...props }: CardHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-5 pt-4.5 pb-1", className)} {...props}>
      <div className="min-w-0">
        {/* Wraps on phones — a card title beside an action has too little room to truncate without cutting a word. */}
        <h2 className="text-[15px] font-bold text-ink sm:truncate">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </header>
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pt-3 pb-5", className)} {...props} />;
}
