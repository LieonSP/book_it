import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  metadata?: React.ReactNode
  showChevron?: boolean
  onClick?: () => void
}

const ListRow = React.forwardRef<HTMLDivElement, ListRowProps>(
  ({ className, label, metadata, showChevron = true, onClick, ...props }, ref) => {
    const Component = onClick ? "button" : "div"

    return (
      <Component
        ref={ref as React.Ref<HTMLButtonElement & HTMLDivElement>}
        className={cn(
          "flex min-h-12 w-full items-center justify-between px-4 py-3 text-left transition-colors",
          onClick && "hover:bg-neutral-50 active:bg-primary-light cursor-pointer",
          className
        )}
        onClick={onClick}
        {...(props as React.HTMLAttributes<HTMLButtonElement & HTMLDivElement>)}
      >
        <span className="text-sm leading-[1.5] text-neutral-900">{label}</span>
        <div className="flex items-center gap-2">
          {metadata && (
            <span className="text-xs leading-[1.4] text-neutral-500">
              {metadata}
            </span>
          )}
          {showChevron && (
            <ChevronRight className="h-4 w-4 text-neutral-500" />
          )}
        </div>
      </Component>
    )
  }
)
ListRow.displayName = "ListRow"

export { ListRow }
