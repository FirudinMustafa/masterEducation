"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readConsent } from "@/components/legal/cookie-consent";

const SESSION_KEY = "me-session-id";

function ensureSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "nosession";
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);

  // Cerez tercihleri analytics'i kontrol eder. Acik riza yoksa pageview
  // kayit edilmez. Tercih degisirse anlik yansir.
  useEffect(() => {
    const sync = () => setAnalyticsAllowed(readConsent()?.analytics === true);
    sync();
    window.addEventListener("me-cookie-consent-change", sync);
    return () => window.removeEventListener("me-cookie-consent-change", sync);
  }, []);

  useEffect(() => {
    if (!analyticsAllowed) return;
    if (!pathname) return;
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/bayi") ||
      pathname.startsWith("/api")
    ) {
      return;
    }
    const body = JSON.stringify({
      path: pathname,
      referer: document.referrer || null,
      sessionId: ensureSessionId(),
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/pageview", blob);
      return;
    }
    fetch("/api/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [pathname, analyticsAllowed]);

  return null;
}
