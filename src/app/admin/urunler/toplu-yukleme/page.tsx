import Link from "next/link";
import type { Metadata } from "next";
import { BulkImportForm } from "./bulk-import-form";

export const metadata: Metadata = { title: "Toplu Urun Yukleme - Admin" };

export default function BulkImportPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/urunler"
          className="text-sm text-gray-500 hover:text-brand-black"
        >
          &larr; Urunler
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Toplu Urun Yukleme
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sablonu indirip doldurun, sonra yukleyin. Once preview yapar, hatasizsa
          &quot;Yukle&quot; butonu ile veritabanina ekleriz.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Notlar:</strong>
        <ul className="list-disc list-inside mt-2 space-y-0.5">
          <li>Dosya en fazla 10 MB olabilir.</li>
          <li>nopId benzersizdir; var olan bir nopId kullanilirsa satir reddedilir.</li>
          <li>Yayinevi ve kategori REFERANS sayfalarindaki isimlerden yazilmalidir.</li>
          <li>
            Bir satir hata verirse <strong>hicbir sey eklenmez</strong> (all-or-nothing).
            Hatalari duzeltip tekrar yukleyin.
          </li>
        </ul>
      </div>

      <BulkImportForm />
    </div>
  );
}
