"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserRole, DealerStatus } from "@prisma/client";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  companyName: string | null;
  dealerStatus: DealerStatus | null;
  orderCount: number;
  createdAt: Date;
}

const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: "Musteri",
  DEALER: "Bayi",
  ADMIN: "Admin",
};
const ROLE_COLORS: Record<UserRole, string> = {
  CUSTOMER: "bg-gray-100 text-gray-700",
  DEALER: "bg-emerald-100 text-emerald-700",
  ADMIN: "bg-brand-gold-light text-brand-black",
};

interface Props {
  users: UserRow[];
  currentUserId: string;
}

export function UsersTable({ users, currentUserId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Self-id ve admin'leri otomatik atla — checkbox bile gösterilmez.
  const eligible = useMemo(
    () => users.filter((u) => u.id !== currentUserId && u.role !== "ADMIN"),
    [users, currentUserId]
  );
  const allChecked = useMemo(
    () => eligible.length > 0 && eligible.every((u) => selected.has(u.id)),
    [eligible, selected]
  );

  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) return new Set();
      const n = new Set(prev);
      for (const u of eligible) n.add(u.id);
      return n;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function bulkDelete(mode: "auto" | "anonymize_all" | "hard_only") {
    const verb =
      mode === "auto"
        ? "siparişi olanları anonimleştir, olmayanları kalıcı sil"
        : mode === "anonymize_all"
          ? "hepsini anonimleştir"
          : "yalnız siparişsiz olanları kalıcı sil";
    if (!confirm(`${selected.size} kullanıcı için: ${verb}. Devam edilsin mi?`))
      return;
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/users/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [...selected], mode }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      error?: string;
      hardDeleted?: number;
      anonymized?: number;
      skipped?: number;
      dealersCleanedUp?: number;
      cancelledOrdersTotal?: number;
    };
    if (!res.ok) {
      setError(d.error ?? "Toplu silme başarısız.");
      return;
    }
    const dealerNote =
      d.dealersCleanedUp && d.dealersCleanedUp > 0
        ? ` · ${d.dealersCleanedUp} bayi temizlendi (${d.cancelledOrdersTotal ?? 0} aktif sipariş iptal)`
        : "";
    setInfo(
      `${d.hardDeleted ?? 0} silindi, ${d.anonymized ?? 0} anonimleştirildi, ${d.skipped ?? 0} atlandı${dealerNote}.`
    );
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {info}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Tumunu sec"
                    className="h-4 w-4 cursor-pointer"
                    disabled={eligible.length === 0}
                  />
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Ad</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Firma</th>
                <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Siparis</th>
                <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Kayit</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    Kullanici bulunamadi.
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const isAdmin = u.role === "ADMIN";
                const canSelect = !isSelf && !isAdmin;
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 ${
                      selected.has(u.id) ? "bg-brand-gold-light/10" : ""
                    }`}
                  >
                    <td className="p-3">
                      {canSelect ? (
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleOne(u.id)}
                          className="h-4 w-4 cursor-pointer"
                          aria-label={`${u.name} sec`}
                        />
                      ) : (
                        <span
                          className="inline-block h-4 w-4"
                          title={
                            isSelf
                              ? "Kendi hesabınız"
                              : "Admin hesabı seçilemez"
                          }
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/kullanicilar/${u.id}`}
                        className="font-medium text-brand-black hover:text-brand-gold-dark"
                      >
                        {u.name}
                      </Link>
                      {u.phone && (
                        <p className="text-xs text-gray-500">{u.phone}</p>
                      )}
                    </td>
                    <td className="p-3 text-gray-700">{u.email}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${ROLE_COLORS[u.role]}`}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600 text-xs">
                      {u.companyName ? (
                        <>
                          <span className="font-medium">{u.companyName}</span>
                          {u.dealerStatus && (
                            <span className="text-gray-400">
                              {" "}
                              · {u.dealerStatus}
                            </span>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3 text-right text-gray-600">
                      {u.orderCount}
                    </td>
                    <td className="p-3 text-right text-xs text-gray-500">
                      {new Date(u.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-gray-200 bg-white shadow-lg">
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-brand-black">
                {selected.size} kullanici secildi
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-brand-black underline cursor-pointer"
              >
                Secimi temizle
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => bulkDelete("auto")}
                disabled={pending}
                className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
                title="Siparişi olanları anonimleştirir, siparişsizleri kalıcı siler"
              >
                Akilli Sil
              </button>
              <button
                onClick={() => bulkDelete("anonymize_all")}
                disabled={pending}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                title="Hepsini anonimleştir (KVKK)"
              >
                Anonimleştir
              </button>
              <button
                onClick={() => bulkDelete("hard_only")}
                disabled={pending}
                className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                title="Yalnız siparişsiz kullanicilari kalici siler"
              >
                Kalıcı Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
