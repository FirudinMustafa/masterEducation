"use client";

import { useState } from "react";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      prompt("Linki kopyalayin:", url);
    }
  }

  return (
    <button
      onClick={copy}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
        copied
          ? "bg-green-600 text-white border-green-600"
          : "bg-brand-gold text-brand-black border-brand-gold hover:bg-brand-gold-dark"
      }`}
    >
      {copied ? "Kopyalandi ✓" : "Linki Kopyala"}
    </button>
  );
}
