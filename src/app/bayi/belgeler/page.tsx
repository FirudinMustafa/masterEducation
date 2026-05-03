import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DealerDocuments } from "@/components/dealer-documents";

export const metadata: Metadata = { title: "Belgelerim - Bayi Paneli" };

export default async function DealerDocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/giris");

  // JWT'deki dealerId stale olabilir (yeni basvuru sonrasi). DB'den fresh fetch
  // yap — kullanici basvuru yaptiginda hemen belge yukleyebilsin diye.
  const dealer = await prisma.dealer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!dealer) redirect("/bayi-basvuru");
  const dealerId = dealer.id;

  const documents = await prisma.dealerDocument.findMany({
    where: { dealerId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Belgelerim
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Vergi levhasi, ticaret sicil gazetesi ve imza sirkulerinizi yukleyin.
          Admin bayi basvurunuzu degerlendirirken bu belgeleri inceleyecek.
        </p>
      </div>

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
        uploadUrl="/api/dealer/documents"
        deleteUrlTemplate="/api/dealer/documents/{id}"
        canEdit
      />
    </div>
  );
}
