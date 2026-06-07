import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { BulkOrderForm } from "./bulk-order-form";

export const metadata: Metadata = { title: "Toplu Sipariş - Bayi Paneli" };

export default async function BulkOrderPage() {
  const session = await auth();
  if (!session?.user?.dealerId) redirect("/giris");
  // Toplu sipariş cari hesap modunda calisir — pesin bayilerde anlam tasimaz.
  if (session.user.dealerPaymentTerms === "PREPAID") redirect("/bayi");

  const [dealer, address] = await Promise.all([
    prisma.dealer.findUnique({
      where: { id: session.user.dealerId },
      select: { companyName: true },
    }),
    prisma.address.findFirst({
      where: { userId: session.user.id, isDefault: true },
    }),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Toplu Sipariş
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Excel ile sku + adet listesi yükleyin; fiyatlari ve stok durumunu
          görüntüledikten sonra acik hesap olarak sipariş oluşturun.
        </p>
      </div>

      <BulkOrderForm
        defaultEmail={session.user.email ?? ""}
        defaultName={dealer?.companyName ?? session.user.name ?? ""}
        defaultAddress={
          address
            ? {
                phone: address.phone,
                city: address.city,
                district: address.district,
                postalCode: address.postalCode ?? "",
                address: address.addressLine,
              }
            : null
        }
      />
    </div>
  );
}
