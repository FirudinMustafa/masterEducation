import Link from "next/link";
import { ProductCard } from "@/components/products/product-card";
import { ArrowRightIcon } from "@/components/ui/icons";
import { SectionHeading } from "./section-heading";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  dealerPrice?: number | null;
  dealerDiscountPct?: number | null;
  sku: string;
  stockQuantity: number;
  hasImage: boolean;
  publisherName?: string | null;
  imageSrc?: string | null;
  avgRating?: number | null;
  reviewCount?: number;
}

interface Props {
  products: Product[];
  eyebrow: string;
  title: string;
  italicWord?: string;
  subtitle?: string;
  link: string;
  linkLabel?: string;
}

/**
 * Editorial product carousel — numbered heading + scroll-snap horizontal scroll.
 * Cards have hover lift; section padding gives breathing room so lift doesn't clip.
 */
export function ProductCarousel({
  products,
  eyebrow,
  title,
  italicWord,
  subtitle,
  link,
  linkLabel = "Tümunu Gor",
}: Props) {
  if (products.length === 0) return null;

  return (
    <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        italicWord={italicWord}
        subtitle={subtitle}
        link={{ href: link, label: linkLabel }}
      />

      {/* Carousel viewport — overflow-x: auto, but with vertical padding so
          hover-lift on cards doesn't clip. Edge fade masks hint at more. */}
      <div className="relative -mx-4 sm:-mx-6">
        <div className="pointer-events-none absolute left-0 top-0 z-10 hidden h-full w-12 bg-gradient-to-r from-neutral-50 to-transparent sm:block" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 hidden h-full w-12 bg-gradient-to-l from-neutral-50 to-transparent sm:block" />

        {/* py-8 = hover lift için dikey alan; overflow-x-auto'nun yan etkisi
            olarak overflow-y de implicit auto olur, padding bunu kompanse eder. */}
        <div className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 py-8 sm:px-6">
          {products.map((p) => (
            <div
              key={p.id}
              className="w-[68%] shrink-0 snap-start sm:w-[42%] md:w-[32%] lg:w-[24%]"
            >
              <ProductCard product={p} />
            </div>
          ))}

          {/* End-of-list CTA card */}
          <Link
            href={link}
            className="group flex w-[68%] shrink-0 snap-start items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-white text-center transition-all hover:-translate-y-1 hover:border-brand-gold hover:bg-brand-gold-light/30 sm:w-[42%] md:w-[32%] lg:w-[24%]"
          >
            <div className="flex flex-col items-center gap-3 p-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-950 text-brand-gold transition-transform group-hover:rotate-45 group-hover:scale-110">
                <ArrowRightIcon className="h-6 w-6" />
              </span>
              <p className="font-display text-lg font-black text-neutral-950">{linkLabel}</p>
              <p className="text-xs text-neutral-500">Daha fazla ürün kesfet</p>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
