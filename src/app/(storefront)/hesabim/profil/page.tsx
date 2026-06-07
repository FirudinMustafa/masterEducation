import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profil Duzenle" };

export default async function ProfileEditPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true, emailVerified: true },
  });
  if (!user) redirect("/giris");

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href="/hesabim"
        className="text-sm text-gray-500 hover:text-brand-black"
      >
        &larr; Hesabım
      </Link>
      <h1 className="text-2xl font-display font-bold text-brand-black mt-4 mb-6">
        Profil Bilgileri
      </h1>

      <ProfileForm
        initial={{
          name: user.name,
          email: user.email,
          phone: user.phone ?? "",
        }}
        emailVerified={!!user.emailVerified}
      />
    </div>
  );
}
