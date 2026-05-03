import type { Metadata } from "next";
import Link from "next/link";
import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Email Dogrulama",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function EmailVerifyPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 text-center">
        <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
          Dogrulama baglantisi gecersiz
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Token eksik. Email&apos;inizdeki baglantiyi tekrar deneyin veya hesabinizdan
          yeni dogrulama isteyin.
        </p>
        <Link
          href="/hesabim"
          className="inline-flex px-5 py-2.5 bg-brand-gold text-brand-black font-semibold rounded-lg hover:bg-brand-gold-dark"
        >
          Hesabima git
        </Link>
      </div>
    );
  }

  return <VerifyClient token={token} />;
}
