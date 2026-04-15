import * as React from "react"
import { cn } from "@/lib/utils"

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  actionLabel?: string
  onAction?: () => void
}

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ className, title, actionLabel, onAction, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-between py-2", className)}
        {...props}
      >
        <h2 className="text-lg font-semibold leading-[1.3] text-neutral-900">
          {title}
        </h2>
        {actionLabel && (
          <button
            onClick={onAction}
            className="text-xs font-semibold leading-[1.4] text-primary hover:text-primary-dark transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
    )
  }
)
SectionHeader.displayName = "SectionHeader"

export { SectionHeader }
