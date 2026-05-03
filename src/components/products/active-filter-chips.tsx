"use client";

import { useRouter } from "next/navigation";
import { XMarkIcon } from "@/components/ui/icons";

interface Chip {
  key: string;
  label: string;
  urlKey: string;
}

interface Props {
  chips: Chip[];
  baseParams: Record<string, string | undefined>;
}

export function ActiveFilterChips({ chips, baseParams }: Props) {
  const router = useRouter();

  if (chips.length === 0) return null;

  function removeChip(urlKey: string) {
    const next = { ...baseParams };
    delete next[urlKey];
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    router.push(`/urunler?${params.toString()}`);
  }

  function clearAll() {
    router.push("/urunler");
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-neutral-500">Aktif filtreler:</span>
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => removeChip(c.urlKey)}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 cursor-pointer"
        >
          {c.label}
          <XMarkIcon className="h-3 w-3 text-neutral-400" />
        </button>
      ))}
      <button
        onClick={clearAll}
        className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
      >
        Tumunu temizle
      </button>
    </div>
  );
}
