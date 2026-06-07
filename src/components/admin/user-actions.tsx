"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { useBusy } from "@/lib/hooks/use-busy";

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
  // Tek useBusy: rol kaydet + sil + anonimlestir paylasir; in-flight bir
  // aksiyon icindeyken digerleri tetiklenemez.
  const { busy, run } = useBusy();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(currentRole);
  const [password, setPassword] = useState("");

  function setUserPassword() {
    return run(async () => {
      setError(null);
      setSuccess(null);
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Şifre güncellenemedi.");
        return;
      }
      setPassword("");
      setSuccess("Şifre güncellendi. Kullanıcıya e-posta ile bildirildi.");
    });
  }

  function saveRole() {
    return run(async () => {
      setError(null);
      setSuccess(null);
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Rol güncellenemedi.");
        return;
      }
      setSuccess("Rol güncellendi.");
      router.refresh();
    });
  }

  async function deleteUser() {
    if (!confirm("Bu kullanıcı tamamen silinsin mi? Bu islem geri alinamaz.")) return;
    await run(async () => {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Silinemedi.");
        return;
      }
      router.push("/admin/kullanicilar");
    });
  }

  async function anonymizeUser() {
    if (
      !confirm(
        `Bu kullanıcınin ${orderCount} siparişi var. Tam silme yerine kisisel bilgileri silinip siparişler korunacak.\n\nDevam edilsin mi?`
      )
    )
      return;
    await run(async () => {
      const res = await fetch(
        `/api/admin/users/${userId}?mode=anonymize`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Anonimlestirme başarısız.");
        return;
      }
      router.push("/admin/kullanicilar");
    });
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
            disabled={isSelf || busy}
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
            disabled={isSelf || busy || role === currentRole}
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

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Şifre Belirle / Sıfırla
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Yeni şifre (en az 8 karakter)"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <button
            onClick={setUserPassword}
            disabled={busy || password.length < 8}
            className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-semibold hover:bg-neutral-700 disabled:opacity-50 cursor-pointer"
          >
            Kaydet
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Bayiye giriş erişimi vermek/yenilemek için kullanılır; şifre e-posta ile iletilir.
        </p>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        {orderCount > 0 ? (
          <>
            <button
              onClick={anonymizeUser}
              disabled={isSelf || busy}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              Hesabi Anonimlestir
            </button>
            <p className="text-xs text-gray-500">
              {orderCount} siparişte kayıtli oldugu icin tam silinemez. Anonimlestirme
              ile kisisel bilgiler silinir, siparişler tarihte kalir.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={deleteUser}
              disabled={isSelf || busy}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              Kullanıcıyi Sil
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
