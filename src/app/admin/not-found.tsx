import Link from "next/link";

/**
 * Admin 404 — geçersiz id ile açılan kayıt sayfalarında (`notFound()`)
 * admin layout'u içinde gösterilir.
 */
export default function AdminNotFound() {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <p className="text-5xl font-bold text-brand-gold mb-2">404</p>
      <h1 className="text-xl font-semibold text-brand-black mb-2">
        Kayıt bulunamadı
      </h1>
      <p className="text-brand-muted mb-6">
        Bu kayıt silinmiş olabilir ya da bağlantı geçersiz.
      </p>
      <Link
        href="/admin"
        className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark"
      >
        Panele dön
      </Link>
    </div>
  );
}
