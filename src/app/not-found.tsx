import Link from "next/link";

/**
 * Global 404 — eşleşmeyen URL'ler ve daha yakın bir not-found boundary'si
 * olmayan `notFound()` çağrıları için. Root layout içinde render olur.
 */
export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
      <p className="text-6xl font-display font-bold text-brand-gold mb-2">404</p>
      <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
        Sayfa bulunamadı
      </h1>
      <p className="text-brand-muted mb-6">
        Aradığınız sayfa taşınmış veya kaldırılmış olabilir.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/"
          className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark"
        >
          Anasayfa
        </Link>
        <Link
          href="/urunler"
          className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
        >
          Ürünleri keşfet
        </Link>
      </div>
    </div>
  );
}
