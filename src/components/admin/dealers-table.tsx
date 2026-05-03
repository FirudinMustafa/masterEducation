"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { DealerStatus, DealerPaymentTerms } from "@prisma/client";
import { DealersBulkApproveModal } from "./dealers-bulk-approve-modal";
import { DealersBulkCreditModal } from "./dealers-bulk-credit-modal";

export interface DealerRow {
  id: string;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  contactPerson: string | null;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  status: DealerStatus;
  paymentTerms: DealerPaymentTerms;
  creditLimit: number;
  currentBalance: number;
  createdAt: Date;
}

const STATUS_LABELS: Record<DealerStatus, string> = {
  PENDING: "Bekliyor",
  APPROVED: "Onaylandi",
  REJECTED: "Reddedildi",
  SUSPENDED: "Askiya Alindi",
};
const STATUS_COLORS: Record<DealerStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-gray-100 text-gray-700",
};

interface Props {
  dealers: DealerRow[];
}

export function DealersTable({ dealers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modal, setModal] = useState<"approve" | "credit" | null>(null);

  const allChecked = useMemo(
    () => dealers.length > 0 && dealers.every((d) => selected.has(d.id)),
    [dealers, selected]
  );

  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) return new Set();
      const n = new Set(prev);
      for (const d of dealers) n.add(d.id);
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

  // PENDING bayilerin sayısı (bulk approve için anlamlı)
  const selectedPendingCount = useMemo(
    () =>
      dealers.filter((d) => selected.has(d.id) && d.status === "PENDING")
        .length,
    [dealers, selected]
  );
  // APPROVED + OPEN_ACCOUNT (bulk credit için)
  const selectedCreditEligible = useMemo(
    () =>
      dealers.filter(
        (d) =>
          selected.has(d.id) &&
          d.status === "APPROVED" &&
          d.paymentTerms === "OPEN_ACCOUNT"
      ).length,
    [dealers, selected]
  );

  async function approveBulk(payload: {
    paymentTerms: DealerPaymentTerms;
    creditLimit: number;
    notes?: string;
  }) {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/dealers/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerIds: [...selected], ...payload }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      error?: string;
      approved?: number;
      skipped?: number;
    };
    if (!res.ok) {
      setError(d.error ?? "Onay başarısız.");
      return;
    }
    setInfo(
      `${d.approved ?? 0} bayi onaylandı${d.skipped ? `, ${d.skipped} atlandı (PENDING değil)` : ""}.`
    );
    setModal(null);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  async function creditBulk(payload: {
    mode: string;
    value: number;
    minLimit?: number;
  }) {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/dealers/bulk-adjust-credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerIds: [...selected], ...payload }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      error?: string;
      affected?: number;
    };
    if (!res.ok) {
      setError(d.error ?? "Limit ayarı başarısız.");
      return;
    }
    setInfo(`${d.affected ?? 0} bayinin limiti güncellendi.`);
    setModal(null);
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
        {dealers.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            Bayi bulunamadi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      aria-label="Tumunu sec"
                      className="h-4 w-4 cursor-pointer"
                    />
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Firma</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Yetkili</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Iletisim</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Odeme</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Limit</th>
                  <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">Durum</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Basvuru</th>
                </tr>
              </thead>
              <tbody>
                {dealers.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 ${
                      selected.has(d.id) ? "bg-brand-gold-light/10" : ""
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggleOne(d.id)}
                        aria-label={`${d.companyName} sec`}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/bayiler/${d.id}`}
                        className="font-semibold text-brand-black hover:text-brand-gold-dark"
                      >
                        {d.companyName}
                      </Link>
                      <p className="text-xs text-gray-500">{d.taxOffice}</p>
                    </td>
                    <td className="p-3">
                      <p className="font-medium text-brand-black">{d.userName}</p>
                      {d.contactPerson && (
                        <p className="text-xs text-gray-500">{d.contactPerson}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="text-gray-700">{d.userEmail}</p>
                      {d.userPhone && (
                        <p className="text-xs text-gray-500">{d.userPhone}</p>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {d.paymentTerms === "PREPAID" ? (
                        <span className="text-gray-700">Pesin</span>
                      ) : (
                        <span className="text-gray-700">Cari</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-xs">
                      {d.paymentTerms === "PREPAID"
                        ? "—"
                        : formatPrice(d.creditLimit)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[d.status]}`}
                      >
                        {STATUS_LABELS[d.status]}
                      </span>
                    </td>
                    <td className="p-3 text-right text-gray-500 text-xs">
                      {new Date(d.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-gray-200 bg-white shadow-lg">
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-brand-black">
                {selected.size} bayi secildi
              </span>
              {selectedPendingCount > 0 && (
                <span className="text-xs text-gray-500">
                  ({selectedPendingCount} onay bekliyor)
                </span>
              )}
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-brand-black underline cursor-pointer"
              >
                Secimi temizle
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModal("approve")}
                disabled={pending || selectedPendingCount === 0}
                className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
                title={
                  selectedPendingCount === 0
                    ? "PENDING durumda bayi yok"
                    : `${selectedPendingCount} bayi onaylanacak`
                }
              >
                Toplu Onayla
              </button>
              <button
                onClick={() => setModal("credit")}
                disabled={pending || selectedCreditEligible === 0}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                title={
                  selectedCreditEligible === 0
                    ? "Cari hesap modunda APPROVED bayi yok"
                    : `${selectedCreditEligible} bayi etkilenecek`
                }
              >
                Limit Ayarla
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "approve" && (
        <DealersBulkApproveModal
          count={selectedPendingCount}
          totalSelected={selected.size}
          onClose={() => setModal(null)}
          onApply={approveBulk}
          pending={pending}
        />
      )}
      {modal === "credit" && (
        <DealersBulkCreditModal
          count={selectedCreditEligible}
          totalSelected={selected.size}
          onClose={() => setModal(null)}
          onApply={creditBulk}
          pending={pending}
        />
      )}
    </>
  );
}
