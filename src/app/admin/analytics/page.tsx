import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Analytics - Admin" };

export default async function AdminAnalyticsPage() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    total7d,
    totalToday,
    topPaths,
    uniqueSessions7d,
    byDay,
    topReferrers,
  ] = await Promise.all([
    prisma.pageView.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.pageView.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    prisma.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 20,
    }),
    prisma.pageView.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        sessionId: { not: null },
      },
      select: { sessionId: true },
      distinct: ["sessionId"],
    }),
    prisma.$queryRaw<{ day: Date; views: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS views
      FROM "page_views"
      WHERE "createdAt" >= ${sevenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.pageView.groupBy({
      by: ["referer"],
      where: {
        createdAt: { gte: thirtyDaysAgo },
        referer: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { referer: "desc" } },
      take: 10,
    }),
  ]);

  const uniqueSessionCount = uniqueSessions7d.length;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Analytics
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Magaza trafigi ozeti (son 30 gün). Admin/bayi sayfalari sayılmaz.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Bugun" value={totalToday} />
        <StatCard label="Son 7 gün" value={total7d} />
        <StatCard
          label="Son 7 gün tekil ziyaretci"
          value={uniqueSessionCount}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-brand-black">
            Günluk Trafik (son 7 gün)
          </h2>
        </div>
        {byDay.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">Veri yok.</p>
        ) : (
          <BarChart
            rows={byDay.map((r) => ({
              label: new Date(r.day).toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "short",
              }),
              value: Number(r.views),
            }))}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-brand-black">En Çok Ziyaret</h2>
          </div>
          {topPaths.length === 0 ? (
            <p className="p-5 text-sm text-gray-500">Veri yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500 border-b border-gray-100">
                  <th className="text-left p-3">Sayfa</th>
                  <th className="text-right p-3">Görüntülenme</th>
                </tr>
              </thead>
              <tbody>
                {topPaths.map((p) => (
                  <tr key={p.path} className="border-b border-gray-50">
                    <td className="p-3 truncate max-w-xs font-mono text-xs">
                      {p.path}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {p._count._all}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-brand-black">
              En Çok Yönlendiren
            </h2>
          </div>
          {topReferrers.length === 0 ? (
            <p className="p-5 text-sm text-gray-500">Veri yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500 border-b border-gray-100">
                  <th className="text-left p-3">Kaynak</th>
                  <th className="text-right p-3">Sayı</th>
                </tr>
              </thead>
              <tbody>
                {topReferrers.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="p-3 truncate max-w-xs text-xs">
                      {r.referer ?? "—"}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {r._count._all}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-brand-black mt-1">
        {value.toLocaleString("tr-TR")}
      </p>
    </div>
  );
}

function BarChart({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="p-5 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-20">{r.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className="h-full bg-brand-gold"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-brand-black w-12 text-right">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
