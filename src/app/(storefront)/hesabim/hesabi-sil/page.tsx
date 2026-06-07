import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = {
  title: "Hesabi Sil",
  robots: { index: false, follow: false },
};

export default async function DeleteAccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href="/hesabim"
        className="text-sm text-gray-500 hover:text-brand-black"
      >
        &larr; Hesabım
      </Link>

      <h1 className="text-2xl font-display font-bold text-brand-black mt-4 mb-2">
        Hesabi Sil
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        Bu islem geri alinamaz. KVKK kapsaminda kisisel bilgileriniz
        kaldirilacaktir.
      </p>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2 mb-6">
        <p className="font-semibold">Ne olacak?</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Sipariş gecmisiniz varsa:</strong> ad, email, telefon,
            adres bilgileriniz anonimlestirilir. Fatura/muhasebe kayıtlari
            korunur ama size bagli olmaz.
          </li>
          <li>
            <strong>Sipariş gecmisiniz yoksa:</strong> hesabiniz tamamen silinir.
          </li>
          <li>Favoriler, karşılaştırma listesi ve sepet bilgisi cihazinizdan temizlenmez — tarayici verilerinizi silerek kaldirabilirsiniz.</li>
          <li>
            Onaylı bayi hesaplari bu akistan silinemez — cari kapatma icin
            destek ile iletişime gecin.
          </li>
        </ul>
      </div>

      <DeleteAccountForm />
    </div>
  );
}
