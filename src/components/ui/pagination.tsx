"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  searchParams?: Record<string, string>;
}

export function Pagination({ currentPage, totalPages, baseUrl, searchParams = {} }: PaginationProps) {
  if (totalPages <= 1) return null;

  function buildUrl(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set("sayfa", String(page));
    return `${baseUrl}?${params.toString()}`;
  }

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-8">
      {currentPage > 1 && (
        <Link
          href={buildUrl(currentPage - 1)}
          className="px-3 py-2 text-sm rounded-lg hover:bg-brand-warm-gray transition-colors"
        >
          Önceki
        </Link>
      )}
      {pages.map((page, i) =>
        page === "..." ? (
          <span key={`dots-${i}`} className="px-2 py-2 text-brand-muted">...</span>
        ) : (
          <Link
            key={page}
            href={buildUrl(page)}
            className={cn(
              "px-3 py-2 text-sm rounded-lg transition-colors",
              page === currentPage
                ? "bg-brand-gold text-brand-black font-semibold"
                : "hover:bg-brand-warm-gray"
            )}
          >
            {page}
          </Link>
        )
      )}
      {currentPage < totalPages && (
        <Link
          href={buildUrl(currentPage + 1)}
          className="px-3 py-2 text-sm rounded-lg hover:bg-brand-warm-gray transition-colors"
        >
          Sonraki
        </Link>
      )}
    </nav>
  );
}
