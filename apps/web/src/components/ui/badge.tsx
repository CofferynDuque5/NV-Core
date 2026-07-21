import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand/15 text-brand",
        success: "border-transparent bg-state-success/15 text-state-success",
        warning: "border-transparent bg-state-warning/15 text-state-warning",
        danger: "border-transparent bg-state-danger/15 text-state-danger",
        neutral: "border-line-strong bg-panel-raised text-ink-muted",
        outline: "border-line-strong text-ink-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
