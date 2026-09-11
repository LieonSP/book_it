"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helperText?: string
  error?: string
}

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ className, label, helperText, error, id, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id || generatedId
    const hasError = !!error

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold leading-[1.4] text-neutral-900"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          className={cn(
            "h-11 w-full rounded-lg border bg-white px-3 text-sm leading-[1.5] text-neutral-900 placeholder:text-neutral-500 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-50",
            hasError
              ? "border-error focus:ring-error focus:border-error"
              : "border-neutral-200",
            className
          )}
          ref={ref}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          {...props}
        />
        {hasError && (
          <p
            id={`${inputId}-error`}
            className="text-xs leading-[1.4] text-error"
          >
            {error}
          </p>
        )}
        {!hasError && helperText && (
          <p
            id={`${inputId}-helper`}
            className="text-xs leading-[1.4] text-neutral-500"
          >
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
InputField.displayName = "InputField"

export { InputField }
