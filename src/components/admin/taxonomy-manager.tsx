"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBusy } from "@/lib/hooks/use-busy";
import { useErrorScroll } from "@/lib/hooks/use-error-scroll";
import { toast } from "@/stores/toast-store";

export interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  type?: "ana" | "detay";
}

interface TaxonomyManagerProps {
  kind: "category" | "publisher";
  items: TaxonomyItem[];
}

const LABELS = {
  category: {
    singular: "Kategori",
    plural: "Kategoriler",
    basePath: "/api/admin/categories",
    storefrontParam: "kategori",
    fkLabel: "kategori",
    // Admin ürün listesinde bu taksonomiye göre filtre paramı (2.3 — içerik görme).
    adminFilterParam: "kategori",
  },
  publisher: {
    singular: "Yayınevi",
    plural: "Yayınevleri",
    basePath: "/api/admin/publishers",
    storefrontParam: "yayınevi",
    fkLabel: "yayınevi",
    adminFilterParam: "yayinevi",
  },
};

export function TaxonomyManager({ kind, items }: TaxonomyManagerProps) {
  const router = useRouter();
  const labels = LABELS[kind];
  // Tek useBusy: oluştur + duzenle kaydet + sil paylasir; race koruma.
  const { busy, run } = useBusy();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useErrorScroll(error);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"ana" | "detay">("ana");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"ana" | "detay">("ana");
  const [filter, setFilter] = useState("");
  // Birleştirme: kaynak satır id'si + seçilen hedef id'si.
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  // Liste kisaysa filtre gizli — 15+ kayıt oldugunda kullanıcınin ise yarar.
  const showFilter = items.length > 15;
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q),
    );
  }, [items, filter]);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      setError(null);
      const body =
        kind === "category"
          ? { name: newName.trim(), type: newType }
          : { name: newName.trim() };
      const res = await fetch(labels.basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Kaydedilemedi.");
        return;
      }
      setNewName("");
      router.refresh();
    });
  }

  async function saveEdit(id: string) {
    await run(async () => {
      setError(null);
      const body =
        kind === "category"
          ? { name: editName.trim(), type: editType }
          : { name: editName.trim() };
      const res = await fetch(`${labels.basePath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Kaydedilemedi.");
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  async function removeItem(id: string, name: string) {
    if (!confirm(`"${name}" silinsin mi?`)) return;
    // confirm()'in zorla-sil dali run() icinde ilerlemeli, ama ilk confirm
    // disinda — boylece busy guard ikinci-tiklamayi yutar.
    await run(async () => {
      setError(null);
      const res = await fetch(`${labels.basePath}/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        productCount?: number;
        discountCount?: number;
      };
      // Iliskili kayıt varsa "zorla sil" secenegini sor.
      if (res.status === 409 && (data.productCount || data.discountCount)) {
        const parts: string[] = [];
        if (data.productCount) parts.push(`${data.productCount} ürünun ${labels.fkLabel} bilgisi temizlenecek`);
        if (data.discountCount) parts.push(`${data.discountCount} iskonto kurali silinecek`);
        const proceed = confirm(
          `"${name}" silinemiyor:\n${data.error}\n\nYine de zorla silmek ister misiniz?\n- ${parts.join("\n- ")}\n\n(Islem geri alinamaz)`
        );
        if (!proceed) return;
        const forceRes = await fetch(`${labels.basePath}/${id}?force=1`, {
          method: "DELETE",
        });
        if (!forceRes.ok) {
          const fd = (await forceRes.json().catch(() => ({}))) as { error?: string };
          setError(fd.error ?? "Zorla silme başarısız.");
          return;
        }
        router.refresh();
        return;
      }
      setError(data.error ?? "Silinemedi.");
    });
  }

  async function mergeItem(sourceId: string, sourceName: string) {
    const target = items.find((i) => i.id === mergeTargetId);
    if (!target) return;
    const proceed = confirm(
      `"${sourceName}" içindeki tüm ürünler "${target.name}" altına taşınacak ve "${sourceName}" silinecek.\n\n(İşlem geri alınamaz)`
    );
    if (!proceed) return;
    await run(async () => {
      setError(null);
      const res = await fetch(`${labels.basePath}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds: [sourceId], targetId: mergeTargetId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        movedProducts?: number;
        targetName?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        const msg = data.error ?? "Birleştirme başarısız.";
        setError(msg);
        toast.error("Birleştirme başarısız", msg);
        return;
      }
      toast.success(
        "Birleştirildi",
        `${data.movedProducts ?? 0} ürün "${data.targetName}" altına taşındı.`
      );
      setMergingId(null);
      setMergeTargetId("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div ref={errorRef} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={createItem}
        className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end"
      >
        <label className="block flex-1 min-w-[200px]">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Yeni {labels.singular} Adi
          </span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`${labels.singular} adi...`}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            required
          />
        </label>
        {kind === "category" && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Tip</span>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "ana" | "detay")}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="ana">Ana</option>
              <option value="detay">Detay</option>
            </select>
          </label>
        )}
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          Ekle
        </button>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {showFilter && (
          <div className="border-b border-gray-100 p-3 bg-gray-50/50">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Listede filtrele..."
              className="w-full max-w-sm px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Ad
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Slug
              </th>
              {kind === "category" && (
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                  Tip
                </th>
              )}
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">
                Ürün
              </th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  {items.length === 0
                    ? "Kayıt yok."
                    : `"${filter}" icin sonuc yok.`}
                </td>
              </tr>
            )}
            {filtered.map((item) => {
              const isEditing = editing === item.id;
              return (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                      />
                    ) : (
                      <span className="font-medium text-brand-black">
                        {item.name}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500 font-mono text-xs">
                    {item.slug}
                  </td>
                  {kind === "category" && (
                    <td className="p-3 text-gray-600">
                      {isEditing ? (
                        <select
                          value={editType}
                          onChange={(e) =>
                            setEditType(e.target.value as "ana" | "detay")
                          }
                          className="px-2 py-1 border border-gray-200 rounded text-sm bg-white"
                        >
                          <option value="ana">Ana</option>
                          <option value="detay">Detay</option>
                        </select>
                      ) : (
                        item.type
                      )}
                    </td>
                  )}
                  <td className="p-3 text-right text-gray-600">
                    {item.productCount}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(item.id)}
                          disabled={busy || !editName.trim()}
                          className="text-xs text-emerald-600 hover:underline mr-3 cursor-pointer disabled:opacity-50"
                        >
                          Kaydet
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs text-gray-500 hover:underline cursor-pointer"
                        >
                          İptal
                        </button>
                      </>
                    ) : mergingId === item.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500">Hedef:</span>
                        <select
                          value={mergeTargetId}
                          onChange={(e) => setMergeTargetId(e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded text-xs bg-white max-w-[160px]"
                        >
                          <option value="">Seçiniz</option>
                          {items
                            .filter((o) => o.id !== item.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => mergeItem(item.id, item.name)}
                          disabled={busy || !mergeTargetId}
                          className="text-xs text-emerald-600 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Taşı
                        </button>
                        <button
                          onClick={() => {
                            setMergingId(null);
                            setMergeTargetId("");
                          }}
                          className="text-xs text-gray-500 hover:underline cursor-pointer"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link
                          href={`/admin/urunler?${labels.adminFilterParam}=${item.id}`}
                          className="text-xs text-gray-600 hover:underline mr-3"
                        >
                          Ürünleri Gör
                        </Link>
                        <button
                          onClick={() => {
                            setMergingId(item.id);
                            setMergeTargetId("");
                          }}
                          disabled={busy}
                          className="text-xs text-amber-600 hover:underline mr-3 cursor-pointer disabled:opacity-50"
                        >
                          Birleştir
                        </button>
                        <button
                          onClick={() => {
                            setEditing(item.id);
                            setEditName(item.name);
                            setEditType(item.type ?? "ana");
                          }}
                          className="text-xs text-blue-600 hover:underline mr-3 cursor-pointer"
                        >
                          Duzenle
                        </button>
                        <button
                          onClick={() => removeItem(item.id, item.name)}
                          disabled={busy}
                          className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Sil
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
