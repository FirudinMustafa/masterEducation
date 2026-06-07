import Link from "next/link";

/**
 * Storefront 404 — ürün/kategori/yayınevi gibi geçersiz slug'larda
 * `notFound()` çağrıldığında storefront layout'u (header/footer) ile birlikte
 * dostça bir sayfa gösterir.
 */
export default function StorefrontNotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
      <p className="text-6xl font-display font-bold text-brand-gold mb-2">404</p>
      <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
        İçerik bulunamadı
      </h1>
      <p className="text-brand-muted mb-6">
        Bu ürün ya da sayfa artık mevcut değil. Katalogdan arama yapabilirsiniz.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/urunler"
          className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark"
        >
          Tüm ürünler
        </Link>
        <Link
          href="/"
          className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
        >
          Anasayfa
        </Link>
      </div>
    </div>
  );
}
