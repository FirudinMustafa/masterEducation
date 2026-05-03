"use client";

import { cn } from "@/lib/utils";
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

interface FloatingInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string;
  error?: string;
  rightSlot?: ReactNode;
  helper?: string;
}

/**
 * Apple-vari floating-label input.
 * - Boş + odaksız: label ortada placeholder gibi
 * - Doldurulmuş veya odaklanmış: label kompakt halde üstte
 * - 14px placeholder yerine geçer; yumuşak focus halkası
 */
export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  (
    { className, label, error, rightSlot, helper, id, value, defaultValue, onFocus, onBlur, ...props },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [focused, setFocused] = useState(false);
    const hasValue = value !== undefined ? String(value).length > 0 : Boolean(defaultValue);
    const floated = focused || hasValue;

    return (
      <div className="w-full">
        <div
          className={cn(
            "relative rounded-2xl border bg-white transition-all",
            error
              ? "border-rose-300 ring-2 ring-rose-100"
              : focused
                ? "border-neutral-900 ring-4 ring-neutral-900/5"
                : "border-neutral-200 hover:border-neutral-300"
          )}
        >
          <label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute left-4 origin-left transition-all duration-200",
              floated
                ? "top-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500"
                : "top-1/2 -translate-y-1/2 text-[15px] text-neutral-400"
            )}
          >
            {label}
          </label>
          <input
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            className={cn(
              "w-full bg-transparent px-4 pb-2 pt-6 text-[15px] text-neutral-900 placeholder:text-transparent focus:outline-none",
              rightSlot ? "pr-12" : "",
              className
            )}
            {...props}
          />
          {rightSlot && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
          )}
        </div>
        {(error || helper) && (
          <p
            className={cn(
              "mt-1.5 px-1 text-[11px]",
              error ? "text-rose-600" : "text-neutral-500"
            )}
          >
            {error ?? helper}
          </p>
        )}
      </div>
    );
  }
);

FloatingInput.displayName = "FloatingInput";
