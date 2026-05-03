import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { loadInvoiceOrder } from "@/lib/invoice-helpers";
import { InvoiceView } from "@/components/invoice-view";

export const metadata: Metadata = { title: "Siparis Ozeti - Bayi" };

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Bayi sipariş özeti / fatura görüntüleme. Müşteri (/hesabim/siparislerim/[id]
 * /fatura) ile aynı view'ı kullanır ama backHref bayi paneline döner.
 *
 * Auth: yalniz siparişin sahibi olan bayi (veya admin) görür — loadInvoiceOrder
 * restrictUserId parametresi ile başka bayinin siparişine erişim engelli.
 */
export default async function DealerOrderInvoicePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  const { id } = await params;

  const order = await loadInvoiceOrder(
    id,
    session.user.role === "ADMIN" ? undefined : session.user.id,
  );
  if (!order) notFound();

  return (
    <InvoiceView
      order={order}
      mode="invoice"
      backHref="/bayi/faturalar"
    />
  );
}
