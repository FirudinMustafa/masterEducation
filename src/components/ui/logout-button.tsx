"use client";

import { signOutWithCleanup } from "@/lib/client-signout";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOutWithCleanup("/")}
      className="w-full flex items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-danger hover:text-brand-danger transition-colors text-sm font-medium cursor-pointer"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
      </svg>
      Cikis Yap
    </button>
  );
}
