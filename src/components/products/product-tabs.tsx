"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  badge?: string | number;
  content: React.ReactNode;
}

export function ProductTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="mt-8 sm:mt-12">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer sm:px-4 sm:py-3",
              active === t.id
                ? "text-neutral-900"
                : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            {t.label}
            {t.badge != null && (
              <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                {t.badge}
              </span>
            )}
            {active === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-gold" />
            )}
          </button>
        ))}
      </div>
      <div className="py-5 sm:py-6">
        {tabs.find((t) => t.id === active)?.content}
      </div>
    </div>
  );
}
