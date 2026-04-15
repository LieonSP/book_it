"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface NavItem {
  icon: React.ReactNode
  label: string
  href: string
  isActive?: boolean
}

export interface NavBarProps extends React.HTMLAttributes<HTMLElement> {
  items: NavItem[]
  onItemClick?: (item: NavItem) => void
}

const NavBar = React.forwardRef<HTMLElement, NavBarProps>(
  ({ className, items, onItemClick, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]",
          className
        )}
        {...props}
      >
        {items.map((item, index) => (
          <button
            key={index}
            onClick={() => onItemClick?.(item)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
              item.isActive ? "text-primary" : "text-neutral-500"
            )}
          >
            <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5">{item.icon}</span>
            <span className="text-[10px] font-semibold leading-none">
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    )
  }
)
NavBar.displayName = "NavBar"

export { NavBar }
