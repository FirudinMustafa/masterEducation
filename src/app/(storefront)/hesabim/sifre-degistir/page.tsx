import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Sifre Degistir" };

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href="/hesabim"
        className="text-sm text-gray-500 hover:text-brand-black"
      >
        &larr; Hesabim
      </Link>
      <h1 className="text-2xl font-display font-bold text-brand-black mt-4 mb-6">
        Sifre Degistir
      </h1>

      <ChangePasswordForm />
    </div>
  );
}
