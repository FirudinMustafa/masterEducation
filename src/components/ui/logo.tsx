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

// Logo boyutu — logo 4096×1461 (~2.80:1 aspect ratio). Width:height bu
// orana göre ayarlanır, böylece görsel ezilmez.
const SIZES = {
  sm: { w: 126, h: 45 },
  md: { w: 168, h: 60 },
  lg: { w: 224, h: 80 },
  xl: { w: 280, h: 100 },
  "2xl": { w: 364, h: 130 },
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
