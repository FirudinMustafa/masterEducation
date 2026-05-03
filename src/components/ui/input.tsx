import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-brand-black mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "w-full px-4 py-2.5 rounded-lg border bg-white text-brand-black text-sm",
            "placeholder:text-brand-muted/60",
            "focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold",
            "transition-all duration-200",
            error ? "border-brand-danger" : "border-brand-border",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-brand-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
