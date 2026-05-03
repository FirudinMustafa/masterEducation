import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** @deprecated Yeni logo görseli "MASTER EDUCATION" wordmark'ı içeriyor;
   * inline text artık render edilmiyor. Prop geriye dönük uyumluluk için kalır. */
  variant?: "dark" | "light";
  /** @deprecated Yeni logoda yazı zaten görselin içinde — bu prop yok sayılır. */
  withText?: boolean;
  className?: string;
  /** null verirsen Link wrapper kapanır (dış component zaten Link sarıyorsa). */
  href?: string | null;
}

// Logo boyutu — yeni logo 804×438 (~1.835:1 aspect ratio). Width:height bu
// orana göre ayarlanır, böylece görsel ezilmez.
const SIZES = {
  sm: { w: 64, h: 35 },
  md: { w: 88, h: 48 },
  lg: { w: 112, h: 61 },
  xl: { w: 144, h: 78 },
  "2xl": { w: 192, h: 105 },
} as const;

export function Logo({
  size = "md",
  className,
  href = "/",
}: LogoProps) {
  const s = SIZES[size];

  const inner = (
    <Image
      src="/me-logo-v2.png"
      alt="Master Education"
      width={s.w}
      height={s.h}
      priority
      className={cn("shrink-0 object-contain", className)}
    />
  );

  if (href === null || href === "") return inner;
  return (
    <Link href={href} className="inline-flex shrink-0">
      {inner}
    </Link>
  );
}
