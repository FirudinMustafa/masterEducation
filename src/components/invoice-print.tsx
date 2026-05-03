"use client";

import Link from "next/link";

/**
 * Geriye uyum için kalıyor — eskiden window.print() açan trigger; artık no-op.
 * Yeni akış: kullanıcı doğrudan /api/orders/[id]/pdf'i indirir.
 */
export function PrintTrigger() {
  return null;
}

interface PrintButtonsProps {
  backHref: string;
  /** PDF endpoint'i — örn: /api/orders/abc123/pdf */
  pdfHref?: string;
}

export function PrintButtons({ backHref, pdfHref }: PrintButtonsProps) {
  return (
    <div className="no-print flex gap-2 mb-6">
      {pdfHref && (
        <a
          href={pdfHref}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black hover:bg-brand-gold-dark"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          PDF Indir
        </a>
      )}
      <Link
        href={backHref}
        className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
      >
        Geri
      </Link>
    </div>
  );
}
