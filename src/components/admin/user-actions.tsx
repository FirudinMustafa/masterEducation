"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@prisma/client";

interface UserActionsProps {
  userId: string;
  currentRole: UserRole;
  hasDealer: boolean;
  orderCount: number;
  isSelf: boolean;
}

export function UserActions({
  userId,
  currentRole,
  hasDealer,
  orderCount,
  isSelf,
}: UserActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(currentRole);

  async function saveRole() {
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Rol guncellenemedi.");
      return;
    }
    setSuccess("Rol guncellendi.");
    startTransition(() => router.refresh());
  }

  async function deleteUser() {
    if (!confirm("Bu kullanici tamamen silinsin mi? Bu islem geri alinamaz.")) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Silinemedi.");
      return;
    }
    startTransition(() => router.push("/admin/kullanicilar"));
  }

  async function anonymizeUser() {
    if (
      !confirm(
        `Bu kullanicinin ${orderCount} siparisi var. Tam silme yerine kisisel bilgileri silinip siparisler korunacak.\n\nDevam edilsin mi?`
      )
    )
      return;
    const res = await fetch(
      `/api/admin/users/${userId}?mode=anonymize`,
      { method: "DELETE" }
    );
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Anonimlestirme basarisiz.");
      return;
    }
    startTransition(() => router.push("/admin/kullanicilar"));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="font-semibold text-brand-black">Hesap Aksiyonlari</h2>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Rol
        </label>
        <div className="flex gap-2 items-center">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isSelf || pending}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="CUSTOMER">Musteri</option>
            <option value="DEALER" disabled={!hasDealer}>
              Bayi {hasDealer ? "" : "(once basvuru gerekli)"}
            </option>
            <option value="ADMIN">Admin</option>
          </select>
          <button
            onClick={saveRole}
            disabled={isSelf || pending || role === currentRole}
            className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
          >
            Rolu Kaydet
          </button>
        </div>
        {isSelf && (
          <p className="text-xs text-gray-500 mt-1">
            Kendi rolunuzu degistiremezsiniz.
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        {orderCount > 0 ? (
          <>
            <button
              onClick={anonymizeUser}
              disabled={isSelf || pending}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              Hesabi Anonimlestir
            </button>
            <p className="text-xs text-gray-500">
              {orderCount} sipariste kayitli oldugu icin tam silinemez. Anonimlestirme
              ile kisisel bilgiler silinir, siparisler tarihte kalir.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={deleteUser}
              disabled={isSelf || pending}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              Kullaniciyi Sil
            </button>
            <p className="text-xs text-gray-500">
              Tam silme — adresler, sepet, bayi kaydi cascade ile silinir.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
