import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { loadInvoiceOrder } from "@/lib/invoice-helpers";
import { InvoiceView } from "@/components/invoice-view";
import { PrintTrigger } from "@/components/invoice-print";

export const metadata: Metadata = { title: "Siparis Ozeti" };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}

export default async function CustomerInvoicePage({
  params,
  searchParams,
}: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  const { id } = await params;
  const { print } = await searchParams;

  const order = await loadInvoiceOrder(
    id,
    session.user.role === "ADMIN" ? undefined : session.user.id
  );
  if (!order) notFound();

  return (
    <>
      {print === "1" && <PrintTrigger />}
      <InvoiceView
        order={order}
        mode="invoice"
        backHref="/hesabim/siparislerim"
      />
    </>
  );
}
