import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AddressManager } from "@/components/address-manager";

export const metadata: Metadata = { title: "Adreslerim" };

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");

  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/hesabim"
          className="text-gray-400 hover:text-brand-black transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Adreslerim
        </h1>
      </div>

      <AddressManager
        addresses={addresses.map((a) => ({
          id: a.id,
          label: a.label,
          fullName: a.fullName,
          phone: a.phone,
          city: a.city,
          district: a.district,
          postalCode: a.postalCode,
          addressLine: a.addressLine,
          isDefault: a.isDefault,
        }))}
      />
    </div>
  );
}
