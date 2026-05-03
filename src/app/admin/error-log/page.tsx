import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { AdminSearchBar } from "@/components/admin/search-bar";

export const metadata: Metadata = { title: "Hata Logu - Admin" };

const SOURCE_COLORS: Record<string, string> = {
  server: "bg-red-100 text-red-700",
  client: "bg-amber-100 text-amber-700",
  api: "bg-purple-100 text-purple-700",
};

interface PageProps {
  searchParams: Promise<{ sayfa?: string; kaynak?: string; ara?: string }>;
}

export default async function AdminErrorLogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.sayfa || "1"));
  const sourceFilter = params.kaynak || "";
  const search = params.ara?.trim() ?? "";
  const perPage = 50;

  const where: Record<string, unknown> = {};
  if (sourceFilter) where.source = sourceFilter;
  if (search) {
    where.OR = [
      { message: { contains: search, mode: "insensitive" } },
      { url: { contains: search, mode: "insensitive" } },
    ];
  }

  const [errors, total, counts] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.errorLog.count({ where }),
    prisma.errorLog.groupBy({
      by: ["source"],
      _count: { _all: true },
    }),
  ]);
  const countBySource = Object.fromEntries(
    counts.map((c) => [c.source, c._count._all])
  );
  const totalPages = Math.ceil(total / perPage);

  const filters = [
    { value: "", label: "Tumu" },
    { value: "server", label: "Sunucu" },
    { value: "client", label: "Tarayici" },
    { value: "api", label: "API" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Hata Logu
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Toplam {total} · server: {countBySource.server ?? 0} · client:{" "}
          {countBySource.client ?? 0} · api: {countBySource.api ?? 0}
        </p>
      </div>

      <AdminSearchBar
        defaultValue={search}
        placeholder="Hata mesaji veya URL..."
        hiddenParams={{ kaynak: sourceFilter }}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={`/admin/error-log${f.value ? `?kaynak=${f.value}` : ""}${search ? `${f.value ? "&" : "?"}ara=${encodeURIComponent(search)}` : ""}`}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              sourceFilter === f.value
                ? "bg-brand-gold text-brand-black border-brand-gold font-semibold"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {errors.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Hata kaydi yok.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {errors.map((e) => (
              <li key={e.id} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${SOURCE_COLORS[e.source] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {e.source}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(e.createdAt).toLocaleString("tr-TR")}
                    </span>
                  </div>
                  {e.url && (
                    <p className="text-xs text-gray-400 font-mono truncate max-w-md">
                      {e.url}
                    </p>
                  )}
                </div>
                <p className="text-sm font-medium text-brand-black">
                  {e.message}
                </p>
                {e.stack && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">
                      Stack trace
                    </summary>
                    <pre className="mt-1 text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {e.stack}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Sayfa {page} / {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/error-log?sayfa=${page - 1}${sourceFilter ? `&kaynak=${sourceFilter}` : ""}${search ? `&ara=${encodeURIComponent(search)}` : ""}`}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Onceki
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/error-log?sayfa=${page + 1}${sourceFilter ? `&kaynak=${sourceFilter}` : ""}${search ? `&ara=${encodeURIComponent(search)}` : ""}`}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Sonraki
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
