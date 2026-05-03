import type { Metadata } from "next";
import Link from "next/link";
import { BulkImageForm } from "@/components/admin/bulk-image-form";

export const metadata: Metadata = { title: "Toplu Görsel - Admin" };

export default function BulkImagePage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/admin/urunler"
          className="text-sm text-gray-500 hover:text-brand-black"
        >
          &larr; Ürünler
        </Link>
        <h1 className="text-2xl font-display font-bold text-brand-black mt-2">
          Toplu Görsel Yükle
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Klasördeki tüm görselleri seç. Dosya adı (uzantısız) ürünün{" "}
          <strong>ISBN</strong>&apos;iyle eşleşmeli — örnek:{" "}
          <code className="font-mono">9780007235988.jpg</code>.
        </p>
      </div>

      <BulkImageForm />
    </div>
  );
}
