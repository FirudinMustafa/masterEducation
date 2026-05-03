import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadInvoiceOrder } from "@/lib/invoice-helpers";
import { InvoiceView } from "@/components/invoice-view";

export const metadata: Metadata = { title: "Siparis Ozeti - Admin" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderInvoicePage({ params }: PageProps) {
  const { id } = await params;
  const order = await loadInvoiceOrder(id);
  if (!order) notFound();
  return (
    <InvoiceView
      order={order}
      mode="invoice"
      backHref={`/admin/siparisler/${id}`}
    />
  );
}
