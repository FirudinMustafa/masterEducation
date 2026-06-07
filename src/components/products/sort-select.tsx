"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon } from "@/components/ui/icons";

const OPTIONS = [
  { value: "yeni", label: "En Yeni" },
  { value: "çok-satan", label: "Çok Satanlar" },
  { value: "fiyat-artan", label: "Fiyat: Dusukten Yuksege" },
  { value: "fiyat-azalan", label: "Fiyat: Yuksekten Dusuge" },
  { value: "isim", label: "Isim (A-Z)" },
];

export function SortSelect({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    if (e.target.value && e.target.value !== "yeni") {
      params.set("siralama", e.target.value);
    } else {
      params.delete("siralama");
    }
    params.delete("sayfa");
    router.push(`/urunler?${params.toString()}`);
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label="Sıralama"
        value={current}
        onChange={onChange}
        className="appearance-none rounded-lg border border-neutral-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-neutral-700 focus:border-neutral-400 focus:outline-none cursor-pointer"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 h-4 w-4 text-neutral-400" />
    </div>
  );
}
