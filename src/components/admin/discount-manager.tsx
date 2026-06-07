"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DiscountScope } from "@prisma/client";
import { toast } from "@/stores/toast-store";
import { DiscountBulkPicker } from "./discount-bulk-picker";
import { DiscountSimulator } from "./discount-simulator";
import { useBusy } from "@/lib/hooks/use-busy";

interface Rule {
  id: string;
  scope: DiscountScope;
  discountPct: number;
  productId: string | null;
  categoryId: string | null;
  publisherId: string | null;
  discountGroup: string | null;
  product: { name: string; sku: string } | null;
  category: { name: string } | null;
  dealer: { companyName: string };
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  price: number;
  publisherName: string | null;
}

interface Publisher {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

interface OtherDealer {
  id: string;
  companyName: string;
  ruleCount: number;
}

interface DiscountManagerProps {
  dealerId: string;
  dealerName: string;
  rules: Rule[];
  publishers: Publisher[];
  categories: Category[];
  discountGroups: string[];
  otherDealers: OtherDealer[];
}

const SCOPE_LABELS: Record<DiscountScope, string> = {
  PRODUCT: "Ürün",
  CATEGORY: "Kategori",
  DISCOUNT_GROUP: "İskonto Grubu",
  PUBLISHER: "Yayınevi",
  GLOBAL: "Tüm Ürünler",
};

const SCOPE_BADGE: Record<DiscountScope, string> = {
  PRODUCT: "bg-blue-50 text-blue-700",
  CATEGORY: "bg-emerald-50 text-emerald-700",
  DISCOUNT_GROUP: "bg-purple-50 text-purple-700",
  PUBLISHER: "bg-amber-50 text-amber-700",
  GLOBAL: "bg-gray-100 text-gray-700",
};

type Tab = "rules" | "bulk" | "sim" | "excel" | "copy";

export function DiscountManager({
  dealerId,
  dealerName,
  rules,
  publishers,
  categories,
  discountGroups,
  otherDealers,
}: DiscountManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("rules");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        <TabButton active={tab === "rules"} onClick={() => setTab("rules")}>
          Kurallar ({rules.length})
        </TabButton>
        <TabButton active={tab === "bulk"} onClick={() => setTab("bulk")}>
          Toplu Ürün İskontosu
        </TabButton>
        <TabButton active={tab === "sim"} onClick={() => setTab("sim")}>
          Fiyat Simulatoru
        </TabButton>
        <TabButton active={tab === "excel"} onClick={() => setTab("excel")}>
          Excel
        </TabButton>
        <TabButton active={tab === "copy"} onClick={() => setTab("copy")}>
          Bayiden Kopyala
        </TabButton>
      </div>

      {tab === "rules" && (
        <RulesTab
          dealerId={dealerId}
          rules={rules}
          publishers={publishers}
          categories={categories}
          discountGroups={discountGroups}
          pending={pending}
          onRefresh={() => startTransition(() => router.refresh())}
        />
      )}

      {tab === "bulk" && (
        <DiscountBulkPicker
          dealerId={dealerId}
          publishers={publishers}
          onDone={() => startTransition(() => router.refresh())}
        />
      )}

      {tab === "sim" && <DiscountSimulator dealerId={dealerId} dealerName={dealerName} />}

      {tab === "excel" && (
        <ExcelTab dealerId={dealerId} onDone={() => startTransition(() => router.refresh())} />
      )}

      {tab === "copy" && (
        <CopyTab
          dealerId={dealerId}
          otherDealers={otherDealers}
          onDone={() => startTransition(() => router.refresh())}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${
        active
          ? "border-brand-gold text-brand-black"
          : "border-transparent text-gray-500 hover:text-brand-black"
      }`}
    >
      {children}
    </button>
  );
}

// ============== RULES TAB (list + add + bulk delete) ==============

function RulesTab({
  dealerId,
  rules,
  publishers,
  categories,
  discountGroups,
  pending,
  onRefresh,
}: {
  dealerId: string;
  rules: Rule[];
  publishers: Publisher[];
  categories: Category[];
  discountGroups: string[];
  pending: boolean;
  onRefresh: () => void;
}) {
  // Tek useBusy: kural ekle + tek sil + toplu sil ortak guard. Bir aksiyon
  // in-flight iken digerleri tetiklenemez (yarisma korunmasi).
  const { busy, run } = useBusy();
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<DiscountScope>("GLOBAL");
  const [pct, setPct] = useState("");
  const [productId, setProductId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [discountGroup, setDiscountGroup] = useState("");

  const [scopeFilter, setScopeFilter] = useState<DiscountScope | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visibleRules = useMemo(
    () => (scopeFilter ? rules.filter((r) => r.scope === scopeFilter) : rules),
    [rules, scopeFilter],
  );

  // Debounced product search; scope/query değiştiğinde sonuçları temizleyip
  // yeni fetch tetikliyoruz.
  useEffect(() => {
    if (scope !== "PRODUCT") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProductResults([]);
      return;
    }
    const q = productQuery.trim();
    if (q.length < 2) {
      setProductResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/products/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { products: ProductSearchResult[] };
        setProductResults(data.products);
      } catch {}
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [productQuery, scope]);

  function addRule() {
    return run(async () => {
      setError(null);
      const payload = {
        dealerId,
        scope,
        discountPct: Number(pct),
        productId: scope === "PRODUCT" ? productId : null,
        categoryId: scope === "CATEGORY" ? categoryId : null,
        publisherId: scope === "PUBLISHER" ? publisherId : null,
        discountGroup: scope === "DISCOUNT_GROUP" ? discountGroup : null,
      };
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Kayıt başarısız.");
        return;
      }
      setPct("");
      setProductId("");
      setProductQuery("");
      setSelectedProduct(null);
      setProductResults([]);
      setCategoryId("");
      setPublisherId("");
      setDiscountGroup("");
      toast.success("Kural eklendi");
      onRefresh();
    });
  }

  async function deleteOne(id: string) {
    if (!confirm("Silinsin mi?")) return;
    await run(async () => {
      const res = await fetch(`/api/admin/discounts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Silme başarısız");
        return;
      }
      toast.info("Silindi");
      onRefresh();
    });
  }

  async function deleteBulk() {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} kural silinsin mi?`)) return;
    await run(async () => {
      const res = await fetch("/api/admin/discounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) {
        toast.error("Silme başarısız");
        return;
      }
      const data = (await res.json()) as { deleted: number };
      setSelected(new Set());
      toast.info(`${data.deleted} kural silindi`);
      onRefresh();
    });
  }

  function toggleAll() {
    if (selected.size === visibleRules.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleRules.map((r) => r.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function targetLabel(r: Rule): string {
    if (r.product) return `${r.product.name} (${r.product.sku})`;
    if (r.category) return r.category.name;
    if (r.publisherId) {
      const p = publishers.find((pu) => pu.id === r.publisherId);
      return p?.name ?? r.publisherId;
    }
    if (r.discountGroup) return r.discountGroup;
    return "Tüm ürünler";
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-brand-black mb-3">Tek Kural Ekle</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block md:col-span-1">
            <span className="block text-xs font-medium text-gray-500 mb-1">Kapsam</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as DiscountScope)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {(Object.keys(SCOPE_LABELS) as DiscountScope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          {scope === "PRODUCT" && (
            <div className="block md:col-span-2 relative">
              <span className="block text-xs font-medium text-gray-500 mb-1">
                Ürün ara (ad veya ISBN)
              </span>
              {selectedProduct ? (
                <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-black truncate">
                      {selectedProduct.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      ISBN: {selectedProduct.sku}
                      {selectedProduct.publisherName
                        ? ` · ${selectedProduct.publisherName}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setProductId("");
                      setProductQuery("");
                    }}
                    className="text-xs text-red-600 hover:underline cursor-pointer"
                  >
                    Degistir
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="En az 2 karakter..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    autoComplete="off"
                  />
                  {productResults.length > 0 && (
                    <ul className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {productResults.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(p);
                              setProductId(p.id);
                              setProductResults([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-brand-gold-light/30 cursor-pointer"
                          >
                            <p className="text-sm font-medium text-brand-black line-clamp-1">
                              {p.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              ISBN: {p.sku}
                              {p.publisherName ? ` · ${p.publisherName}` : ""}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {scope === "CATEGORY" && (
            <label className="block md:col-span-2">
              <span className="block text-xs font-medium text-gray-500 mb-1">Kategori</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="">Seciniz</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.type ? ` (${c.type})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {scope === "PUBLISHER" && (
            <label className="block md:col-span-2">
              <span className="block text-xs font-medium text-gray-500 mb-1">Yayınevi</span>
              <select
                value={publisherId}
                onChange={(e) => setPublisherId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="">Seciniz</option>
                {publishers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {scope === "DISCOUNT_GROUP" && (
            <label className="block md:col-span-2">
              <span className="block text-xs font-medium text-gray-500 mb-1">Grup</span>
              <select
                value={discountGroup}
                onChange={(e) => setDiscountGroup(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="">Seciniz</option>
                {discountGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          )}

          {scope === "GLOBAL" && <div className="md:col-span-2" />}

          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">İskonto %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
        </div>
        <button
          onClick={addRule}
          disabled={pending || busy || !pct}
          className="mt-3 px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          Kaydet
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-brand-black">Mevcut Kurallar</h3>
            <span className="text-xs text-gray-500">({visibleRules.length} / {rules.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as DiscountScope | "")}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">Tüm kapsam</option>
              {(Object.keys(SCOPE_LABELS) as DiscountScope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
            {selected.size > 0 && (
              <button
                onClick={deleteBulk}
                disabled={busy}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                Secileni sil ({selected.size})
              </button>
            )}
          </div>
        </div>

        {visibleRules.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 text-center">Kural yok.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === visibleRules.length && visibleRules.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                  Kapsam
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                  Hedef
                </th>
                <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">
                  %
                </th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRules.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-medium ${SCOPE_BADGE[r.scope]}`}
                    >
                      {SCOPE_LABELS[r.scope]}
                    </span>
                  </td>
                  <td className="p-3 text-gray-700">{targetLabel(r)}</td>
                  <td className="p-3 text-right font-semibold">
                    %{r.discountPct.toFixed(2).replace(/\.?0+$/, "")}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => deleteOne(r.id)}
                      disabled={busy}
                      className="text-red-600 text-xs hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============== EXCEL TAB ==============

function ExcelTab({ dealerId, onDone }: { dealerId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [replaceAll, setReplaceAll] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();

  async function upload() {
    if (!file) return;
    await run(async () => {
      setMsg(null);
      setError(null);
      const fd = new FormData();
      fd.append("dealerId", dealerId);
      fd.append("file", file);
      if (replaceAll) fd.append("replace", "true");
      const res = await fetch("/api/admin/discounts/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Yükleme başarısız.");
        if (data.errors?.length) setMsg(data.errors.join("\n"));
        return;
      }
      setMsg(
        `${data.upserted} kural islendi.` +
          (data.errors?.length ? ` (${data.errors.length} uyarı)\n${data.errors.join("\n")}` : ""),
      );
      setFile(null);
      onDone();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-brand-black mb-3">Excel ile Toplu Yükle</h3>
      <p className="text-xs text-gray-500 mb-4">
        Sablon icinde <code>productSku</code> veya <code>publisherSlug</code> kullanabilirsiniz — ID ezberlemek zorunda degilsiniz.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/admin/discounts/template?dealerId=${dealerId}`}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Sablon / Mevcut Kurallar İndir
        </a>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={replaceAll}
            onChange={(e) => setReplaceAll(e.target.checked)}
          />
          Mevcut kurallari once sil
        </label>
        <button
          onClick={upload}
          disabled={!file || busy}
          className="px-3 py-2 bg-brand-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
        >
          {busy ? "Yükleniyor..." : "Yükle"}
        </button>
      </div>
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {msg && (
        <pre className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-700 whitespace-pre-wrap">
          {msg}
        </pre>
      )}
    </div>
  );
}

// ============== COPY TAB ==============

function CopyTab({
  dealerId,
  otherDealers,
  onDone,
}: {
  dealerId: string;
  otherDealers: OtherDealer[];
  onDone: () => void;
}) {
  const [fromId, setFromId] = useState("");
  const [replace, setReplace] = useState(false);
  const { busy, run } = useBusy();
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (!fromId) return;
    const from = otherDealers.find((d) => d.id === fromId);
    if (!confirm(`${from?.companyName} bayisinin ${from?.ruleCount} kurali kopyalansin mi?`)) return;
    await run(async () => {
      setError(null);
      const res = await fetch("/api/admin/discounts/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDealerId: fromId, toDealerId: dealerId, replace }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Kopyalama başarısız.");
        return;
      }
      const data = (await res.json()) as { copied: number };
      toast.success(`${data.copied} kural kopyalandi`);
      setFromId("");
      onDone();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-brand-black mb-3">Baska Bayiden Kurallari Kopyala</h3>
      <p className="text-xs text-gray-500 mb-4">
        Kaynak bayinin tüm kurallari bu bayiye upsert edilir. Ayni (kapsam + hedef) varsa yuzde güncellenir.
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="block flex-1 min-w-[250px]">
          <span className="block text-xs font-medium text-gray-500 mb-1">Kaynak Bayi</span>
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">Seciniz...</option>
            {otherDealers
              .filter((d) => d.ruleCount > 0)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.companyName} ({d.ruleCount} kural)
                </option>
              ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
          />
          Once mevcut kurallari sil
        </label>
        <button
          onClick={copy}
          disabled={!fromId || busy}
          className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          {busy ? "Kopyalaniyor..." : "Kopyala"}
        </button>
      </div>
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
