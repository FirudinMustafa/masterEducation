import { formatPrice } from "@/lib/utils";

interface PriceDisplayProps {
  price: number;
  oldPrice?: number | null;
  dealerPrice?: number | null;
  discountPct?: number | null;
  size?: "sm" | "md" | "lg";
}

export function PriceDisplay({ price, oldPrice, dealerPrice, discountPct, size = "md" }: PriceDisplayProps) {
  const textSize = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
  }[size];

  const subTextSize = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  }[size];

  // Dealer view: show list price + dealer price
  if (dealerPrice != null && dealerPrice < price) {
    return (
      <div className="flex flex-col">
        <span className={`${subTextSize} text-brand-muted line-through`}>
          {formatPrice(price)}
        </span>
        <div className="flex items-center gap-2">
          <span className={`${textSize} font-bold text-emerald-600`}>
            {formatPrice(dealerPrice)}
          </span>
          {discountPct != null && discountPct > 0 && (
            <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
              %{discountPct}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Regular view with old price
  if (oldPrice != null && oldPrice > price) {
    return (
      <div className="flex flex-col">
        <span className={`${subTextSize} text-brand-muted line-through`}>
          {formatPrice(oldPrice)}
        </span>
        <span className={`${textSize} font-bold text-brand-black`}>
          {formatPrice(price)}
        </span>
      </div>
    );
  }

  // Simple price
  return (
    <span className={`${textSize} font-bold text-brand-black`}>
      {formatPrice(price)}
    </span>
  );
}
