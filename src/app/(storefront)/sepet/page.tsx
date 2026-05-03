"use client";

import Link from "next/link";
import { useCartStore } from "@/stores/cart-store";
import { ProductImage } from "@/components/products/product-image";
import { CartRefreshBanner } from "@/components/cart/cart-refresh-banner";
import { formatPrice } from "@/lib/utils";
import {
  ShoppingCartIcon,
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  TruckIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";

const FREE_SHIPPING_THRESHOLD = 500;
const SHIPPING_COST = 29.9;

export default function CartPage() {
  const { items, note, removeItem, updateQuantity, setNote, getSubtotal, clearCart } =
    useCartStore();

  const subtotal = getSubtotal();
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_COST;
  const total = subtotal + shipping;
  const freeShippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
          <ShoppingCartIcon className="h-10 w-10 text-neutral-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-neutral-900">Sepetiniz bos</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Urunlerimize goz atin ve sepetinize ekleyin.
        </p>
        <Link
          href="/urunler"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-gold px-6 py-3 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-lg hover:shadow-brand-gold/30"
        >
          Urunleri Kesfet
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-2 font-display text-2xl font-bold text-neutral-900 sm:text-3xl">Sepetim</h1>
      <p className="mb-5 text-sm text-neutral-500 sm:mb-6">
        {items.reduce((n, i) => n + i.quantity, 0)} urun sepetinizde
      </p>

      <CartRefreshBanner />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="space-y-3 lg:col-span-2">
          {/* Free shipping progress */}
          {shipping > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <TruckIcon className="h-5 w-5" />
                <span>
                  <strong>{formatPrice(freeShippingRemaining)}</strong> daha ekleyin,{" "}
                  <strong>ucretsiz kargo</strong> kazanin.
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${freeShippingProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <TruckIcon className="mr-1 inline h-4 w-4" />
              Tebrikler — bu sipariste kargo <strong>ucretsiz</strong>.
            </div>
          )}

          {/* Items */}
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3 sm:gap-4 sm:p-4"
            >
              <Link
                href={`/urunler/${item.product.slug}`}
                className="shrink-0"
              >
                <div className="h-20 w-20 overflow-hidden rounded-lg bg-neutral-50 sm:h-24 sm:w-24">
                  <ProductImage
                    src={item.product.imageSrc}
                    alt={item.product.name}
                    width={96}
                    height={96}
                    className="h-full w-full object-contain p-1"
                  />
                </div>
              </Link>

              <div className="min-w-0 flex-1">
                <Link href={`/urunler/${item.product.slug}`}>
                  <h3 className="truncate text-sm font-medium text-neutral-900 hover:text-brand-gold-dark">
                    {item.product.name}
                  </h3>
                </Link>
                <p className="mt-0.5 text-xs text-neutral-500">ISBN: {item.product.sku}</p>
                <p className="mt-2 text-base font-bold text-neutral-900">
                  {formatPrice(item.product.price)}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {formatPrice(item.product.price * item.quantity)} toplam
                </p>
              </div>

              <div className="flex flex-col items-end justify-between">
                <button
                  onClick={() => removeItem(item.productId)}
                  aria-label="Urunu sil"
                  className="rounded-full p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
                <div className="flex items-center overflow-hidden rounded-lg border border-neutral-200">
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="p-1.5 text-neutral-500 hover:bg-neutral-50 cursor-pointer disabled:opacity-40"
                    disabled={item.quantity <= 1}
                    aria-label="Azalt"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[2ch] px-2 text-center text-sm font-semibold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="p-1.5 text-neutral-500 hover:bg-neutral-50 cursor-pointer disabled:opacity-40"
                    disabled={item.quantity >= item.product.stockQuantity}
                    aria-label="Arttir"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <label className="mb-2 block text-sm font-medium text-neutral-800">
              Siparis Notu <span className="text-neutral-400">(opsiyonel)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ornegin: Kargoya not eklensin..."
              rows={3}
              className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
            />
          </div>

          <button
            onClick={clearCart}
            className="text-xs text-neutral-500 hover:text-rose-600 cursor-pointer"
          >
            Sepeti Temizle
          </button>
        </div>

        {/* Summary */}
        <div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6 lg:sticky lg:top-28">
            <h2 className="mb-4 font-display text-lg font-bold text-neutral-900">
              Siparis Ozeti
            </h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Ara Toplam</dt>
                <dd className="font-medium">{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Kargo</dt>
                <dd className={shipping === 0 ? "font-semibold text-emerald-600" : "font-medium"}>
                  {shipping === 0 ? "Ucretsiz" : formatPrice(shipping)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t border-neutral-100 pt-4">
              <span className="text-sm font-semibold text-neutral-900">Toplam</span>
              <span className="font-display text-2xl font-bold text-neutral-900">
                {formatPrice(total)}
              </span>
            </div>
            <Link
              href="/odeme"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gold py-3 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-lg hover:shadow-brand-gold/30"
            >
              Odemeye Gec
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-neutral-500">
              <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />
              256-bit SSL ile guvenli odeme
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
