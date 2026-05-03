import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "gold" | "success" | "danger" | "muted";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-brand-warm-gray text-brand-black",
  gold: "bg-brand-gold-light text-brand-gold-dark",
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-red-50 text-red-700",
  muted: "bg-gray-100 text-brand-muted",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
