import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-normal leading-[1.4]",
  {
    variants: {
      variant: {
        confirmed: "bg-success-light text-success",
        pending: "bg-warning-light text-warning",
        cancelled: "bg-error-light text-error",
        neutral: "bg-neutral-200/50 text-neutral-500",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(statusBadgeVariants({ variant, className }))}
        {...props}
      />
    )
  }
)
StatusBadge.displayName = "StatusBadge"

export { StatusBadge, statusBadgeVariants }
