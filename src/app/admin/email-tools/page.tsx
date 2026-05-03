import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { CopyLinkButton } from "./copy-link-button";

export const metadata: Metadata = { title: "Email Araclari - Admin" };

/**
 * SMTP aktif edilmeden once kullanicilarin email dogrulama / sifre sifirlama
 * linklerini admin'in manuel bulup paylasabilmesi icin dev helper.
 * SMTP entegre edildiginde bu sayfa arka plana alinabilir.
 */
export default async function AdminEmailToolsPage() {
  const baseUrl = env.NEXTAUTH_URL ?? "http://localhost:3000";
  const now = new Date();

  const [verifyTokens, resetTokens] = await Promise.all([
    prisma.emailVerificationToken.findMany({
      where: { usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.passwordResetToken.findMany({
      where: { usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const verifyUsers = await prisma.user.findMany({
    where: { id: { in: verifyTokens.map((t) => t.userId) } },
    select: { id: true, email: true, name: true, emailVerified: true },
  });
  const resetUsers = await prisma.user.findMany({
    where: { id: { in: resetTokens.map((t) => t.userId) } },
    select: { id: true, email: true, name: true },
  });
  const verifyUserMap = new Map(verifyUsers.map((u) => [u.id, u]));
  const resetUserMap = new Map(resetUsers.map((u) => [u.id, u]));

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Email Araclari
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          SMTP henuz aktif olmadigi icin dogrulama/sifre sifirlama linklerini
          buradan alarak kullaniciya manuel gonderebilirsiniz.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">Nasil kullanilir?</p>
        <ol className="list-decimal list-inside space-y-0.5 text-amber-800">
          <li>Kullanici kayit olunca burada &quot;Dogrulama Linki&quot; cikar.</li>
          <li>&quot;Linki Kopyala&quot; butonuyla al, email / WhatsApp ile paylas.</li>
          <li>Kullanici linke tiklayinca <code>/email-dogrula</code> sayfasi dogrular.</li>
        </ol>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-brand-black">
            Email Dogrulama Linkleri
          </h2>
          <span className="text-xs text-gray-500">
            {verifyTokens.length} aktif
          </span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {verifyTokens.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              Aktif token yok.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase">
                  <th className="p-3">Kullanici</th>
                  <th className="p-3">Olusturma</th>
                  <th className="p-3">Gecerlilik</th>
                  <th className="p-3 text-right">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {verifyTokens.map((t) => {
                  const user = verifyUserMap.get(t.userId);
                  const url = `${baseUrl}/email-dogrula?token=${t.token}`;
                  return (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="p-3">
                        <div className="font-medium text-brand-black">
                          {user?.name ?? "-"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {user?.email ?? "-"}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(t.createdAt).toLocaleString("tr-TR")}
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(t.expiresAt).toLocaleString("tr-TR")}
                      </td>
                      <td className="p-3 text-right">
                        <CopyLinkButton url={url} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-brand-black">
            Sifre Sifirlama Linkleri
          </h2>
          <span className="text-xs text-gray-500">
            {resetTokens.length} aktif
          </span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {resetTokens.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              Aktif token yok.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase">
                  <th className="p-3">Kullanici</th>
                  <th className="p-3">Olusturma</th>
                  <th className="p-3">Gecerlilik</th>
                  <th className="p-3 text-right">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {resetTokens.map((t) => {
                  const user = resetUserMap.get(t.userId);
                  const url = `${baseUrl}/sifre-sifirla?token=${t.token}`;
                  return (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="p-3">
                        <div className="font-medium text-brand-black">
                          {user?.name ?? "-"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {user?.email ?? "-"}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(t.createdAt).toLocaleString("tr-TR")}
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(t.expiresAt).toLocaleString("tr-TR")}
                      </td>
                      <td className="p-3 text-right">
                        <CopyLinkButton url={url} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="text-xs text-gray-500">
        <Link href="/admin/email-log" className="text-brand-gold-dark hover:underline">
          Tum email kayitlari (dryrun/sent/failed) icin email-log
        </Link>
      </div>
    </div>
  );
}
