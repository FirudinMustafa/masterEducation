import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Email Log - Admin" };

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-green-100 text-green-700",
  DRYRUN: "bg-blue-100 text-blue-700",
  DRYRUN_SANDBOX: "bg-amber-100 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
};

interface PageProps {
  searchParams: Promise<{ sayfa?: string; durum?: string; ara?: string }>;
}

export default async function AdminEmailLogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.sayfa || "1"));
  const statusFilter = params.durum || "";
  const search = params.ara || "";
  const perPage = 50;

  const where: Record<string, unknown> = {};
  if (statusFilter) where.status = statusFilter;
  if (search) {
    where.OR = [
      { to: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
    ];
  }

  const [logs, total, counts] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.emailLog.count({ where }),
    prisma.emailLog.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all])
  );
  const totalPages = Math.ceil(total / perPage);

  const filters = [
    { value: "", label: "Tümu" },
    { value: "SENT", label: "Gonderildi" },
    { value: "DRYRUN", label: "Dryrun (SMTP yok)" },
    { value: "DRYRUN_SANDBOX", label: "Sandbox engelli" },
    { value: "FAILED", label: "Başarısız" },
  ];

  const sandboxCount = countByStatus.DRYRUN_SANDBOX ?? 0;
  const failedCount = countByStatus.FAILED ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Email Log
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Toplam {total} kayıt · SENT: {countByStatus.SENT ?? 0} · DRYRUN:{" "}
          {countByStatus.DRYRUN ?? 0} · SANDBOX: {sandboxCount} · FAILED: {failedCount}
        </p>
      </div>

      {/* Resend sandbox uyarısı — domain doğrulanmamışsa kullanıcı maillerinin
          büyük kısmı engelleniyor olabilir. Admin bunu net görmeli. */}
      {sandboxCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">⚠ Resend sandbox kisitlamasi aktif</p>
          <p className="mt-1 text-[13px] leading-relaxed">
            <strong>{sandboxCount}</strong> email Resend tarafindan reddedildi cunku
            gonderici domain&apos;i (onboarding@resend.dev) hesap sahibi disindaki
            adreslere mail gondermeye izin vermiyor. Production icin{" "}
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline hover:no-underline"
            >
              Resend dashboard
            </a>
            &apos;dan kendi domain&apos;inizi (mastereducation.com.tr) DKIM/SPF kayıtlari
            ile dogrulayin, sonra <code className="rounded bg-amber-100 px-1 py-0.5 text-[12px]">.env</code> dosyasinda{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-[12px]">SMTP_FROM</code>&apos;u güncelleyin.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={`/admin/email-log${f.value ? `?durum=${f.value}` : ""}`}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === f.value
                ? "bg-brand-gold text-brand-black border-brand-gold font-semibold"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="ara"
          defaultValue={search}
          placeholder="Email veya konu ile ara..."
          className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        {statusFilter && <input type="hidden" name="durum" value={statusFilter} />}
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Tarih
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Alici
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Konu
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Durum
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Hata
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  Kayıt yok.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-gray-50">
                <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString("tr-TR")}
                </td>
                <td className="p-3 text-gray-700">{l.to}</td>
                <td className="p-3 text-brand-black">{l.subject}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {l.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-red-600 max-w-xs truncate">
                  {l.error ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Sayfa {page} / {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/email-log?sayfa=${page - 1}${statusFilter ? `&durum=${statusFilter}` : ""}${search ? `&ara=${search}` : ""}`}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Önceki
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/email-log?sayfa=${page + 1}${statusFilter ? `&durum=${statusFilter}` : ""}${search ? `&ara=${search}` : ""}`}
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
