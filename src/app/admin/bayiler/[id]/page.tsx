import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { DealerActions } from "@/components/admin/dealer-actions";
import { DealerPaymentForm } from "@/components/admin/dealer-payment-form";
import { LedgerTable, type LedgerRow } from "@/components/ledger-table";
import { DealerDocuments } from "@/components/dealer-documents";

export const metadata: Metadata = { title: "Bayi Detayi - Admin" };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  APPROVED: "Onaylandi",
  REJECTED: "Reddedildi",
  SUSPENDED: "Askiya Alindi",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-gray-100 text-gray-700",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminDealerDetailPage({ params }: PageProps) {
  const { id } = await params;

  const dealer = await prisma.dealer.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          addresses: true,
          orders: {
            select: {
              id: true,
              orderNumber: true,
              total: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      },
      discountRules: {
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!dealer) notFound();

  const available = Number(dealer.creditLimit) - Number(dealer.currentBalance);

  const [ledgerRaw, documents] = await Promise.all([
    prisma.dealerLedger.findMany({
      where: { dealerId: dealer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.dealerDocument.findMany({
      where: { dealerId: dealer.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const orderIds = ledgerRaw
    .map((l) => l.orderId)
    .filter((v): v is string => !!v);
  const orderMap = orderIds.length
    ? new Map(
        (
          await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        ).map((o) => [o.id, o.orderNumber])
      )
    : new Map<string, string>();
  const ledgerRows: LedgerRow[] = ledgerRaw.map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount),
    balanceAfter: Number(r.balanceAfter),
    orderId: r.orderId,
    orderNumber: r.orderId ? orderMap.get(r.orderId) ?? null : null,
    reference: r.reference,
    note: r.note,
    createdAt: r.createdAt,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/bayiler"
          className="text-sm text-gray-500 hover:text-brand-black"
        >
          &larr; Bayiler
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">
            {dealer.companyName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Basvuru: {new Date(dealer.createdAt).toLocaleDateString("tr-TR")}
          </p>
        </div>
        <span
          className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[dealer.status]}`}
        >
          {STATUS_LABELS[dealer.status]}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-brand-black mb-3">Firma Bilgileri</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Vergi Dairesi" value={dealer.taxOffice} />
            <Row label="Vergi No" value={dealer.taxNumber} />
            <Row label="Ticari Sicil" value={dealer.tradeRegNo ?? "-"} />
            <Row label="Yetkili" value={dealer.contactPerson ?? "-"} />
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-brand-black mb-3">Kullanıcı</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Ad" value={dealer.user.name} />
            <Row label="Email" value={dealer.user.email} />
            <Row label="Telefon" value={dealer.user.phone ?? "-"} />
          </dl>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-brand-black mb-3">Ödeme & Cari Durum</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat
            label="Ödeme Modu"
            value={
              dealer.paymentTerms === "PREPAID"
                ? "Pesin (KK / Havale)"
                : "Cari Hesap"
            }
          />
          <Stat
            label="Kredi Limiti"
            value={
              dealer.paymentTerms === "PREPAID"
                ? "—"
                : formatPrice(Number(dealer.creditLimit))
            }
          />
          <Stat label="Bakiye" value={formatPrice(Number(dealer.currentBalance))} />
          <Stat
            label="Kullanilabilir"
            value={
              dealer.paymentTerms === "PREPAID" ? "—" : formatPrice(available)
            }
          />
        </div>
      </div>

      {dealer.user.addresses.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-brand-black mb-3">Adresler</h2>
          <div className="space-y-3">
            {dealer.user.addresses.map((a) => (
              <div key={a.id} className="text-sm text-gray-700 border-l-2 border-gray-100 pl-3">
                <p className="font-medium">{a.fullName}</p>
                <p className="text-gray-500">
                  {a.addressLine}, {a.district}/{a.city}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-brand-black mb-4">Aksiyonlar</h2>
        <DealerActions
          dealerId={dealer.id}
          status={dealer.status}
          creditLimit={Number(dealer.creditLimit)}
          paymentTerms={dealer.paymentTerms}
          notes={dealer.notes}
          rejectionReason={dealer.rejectionReason}
        />
      </div>

      <DealerPaymentForm dealerId={dealer.id} />

      <div className="space-y-3">
        <h2 className="font-semibold text-brand-black">Belgeler</h2>
        <DealerDocuments
          documents={documents.map((d) => ({
            id: d.id,
            kind: d.kind,
            filename: d.filename,
            origName: d.origName,
            sizeBytes: d.sizeBytes,
            createdAt: d.createdAt,
            status: d.status,
            reviewNote: d.reviewNote,
            reviewedAt: d.reviewedAt,
          }))}
          uploadUrl={`/api/admin/dealers/${dealer.id}/documents`}
          deleteUrlTemplate={`/api/admin/dealers/${dealer.id}/documents/{id}`}
          reviewUrlTemplate={`/api/admin/dealers/${dealer.id}/documents/{id}`}
          canEdit
          canReview
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-brand-black">Cari Ekstre</h2>
          <span className="text-xs text-gray-500">
            Son {ledgerRows.length} hareket
          </span>
        </div>
        <LedgerTable rows={ledgerRows} orderLinkBase="/admin/siparisler" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-brand-black">Son Siparişler</h2>
          <span className="text-xs text-gray-500">{dealer.user.orders.length} sipariş</span>
        </div>
        {dealer.user.orders.length === 0 ? (
          <p className="text-sm text-gray-500">Henuz sipariş yok.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {dealer.user.orders.map((o) => (
              <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                <Link
                  href={`/admin/siparisler/${o.id}`}
                  className="font-medium text-brand-black hover:text-brand-gold-dark"
                >
                  {o.orderNumber}
                </Link>
                <span className="text-gray-500 text-xs">
                  {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                </span>
                <span className="font-medium">{formatPrice(Number(o.total))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-brand-black">İskonto Kurallari</h2>
          <Link
            href={`/admin/iskontolar?bayi=${dealer.id}`}
            className="text-sm text-brand-gold-dark hover:underline"
          >
            Yonet &rarr;
          </Link>
        </div>
        {dealer.discountRules.length === 0 ? (
          <p className="text-sm text-gray-500">Tanimli iskonto yok.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {dealer.discountRules.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between">
                <span>
                  <span className="font-medium">{r.scope}</span>
                  {r.product && <span className="text-gray-500"> — {r.product.name}</span>}
                  {r.publisherId && <span className="text-gray-500"> — {r.publisherId}</span>}
                  {r.discountGroup && <span className="text-gray-500"> — {r.discountGroup}</span>}
                </span>
                <span className="font-semibold">%{Number(r.discountPct)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-brand-black text-right">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-brand-black mt-1">{value}</p>
    </div>
  );
}
