"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";

/**
 * Cerez tercihleri — granular (zorunlu/analitik/pazarlama).
 *
 * Saklama: localStorage["me_cookie_consent"] = JSON.stringify({
 *   essential: true,        // her zaman true (zorunlu)
 *   analytics: boolean,
 *   marketing: boolean,
 *   version: 1,             // policy degisirse +1, banner tekrar gorunur
 *   ts: ISO date string
 * })
 *
 * Yenileme: 12 ay sonra (KVKK acik riza tazeliği) veya version bump'ta tekrar gorunur.
 */

const STORAGE_KEY = "me_cookie_consent";
const POLICY_VERSION = 1;
const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 12 ay

export type CookieConsent = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  version: number;
  ts: string;
};

export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (parsed.version !== POLICY_VERSION) return null;
    if (!parsed.ts) return null;
    if (Date.now() - new Date(parsed.ts).getTime() > CONSENT_TTL_MS) return null;
    return {
      essential: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      version: POLICY_VERSION,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

function writeConsent(c: Omit<CookieConsent, "version" | "ts" | "essential">) {
  const payload: CookieConsent = {
    essential: true,
    analytics: c.analytics,
    marketing: c.marketing,
    version: POLICY_VERSION,
    ts: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  // Cache'i sifirla — getSnapshot bir sonraki cagrida fresh okusun
  cachedRaw = null;
  cachedConsent = null;
  window.dispatchEvent(
    new CustomEvent("me-cookie-consent-change", { detail: payload })
  );
}

// useSyncExternalStore subscriber — banner state external store gibi davranir.
function subscribeConsent(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("me-cookie-consent-change", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("me-cookie-consent-change", cb);
  };
}

// useSyncExternalStore'un snapshot'u STABLE bir referans dondurmek zorunda —
// her cagrida yeni objesi infinite loop'a sokar. localStorage'daki raw
// string'i ve onun parse edilmisini cache'liyoruz; raw string degisene kadar
// aynı object referansini doneriz.
let cachedRaw: string | null | undefined = undefined;
let cachedConsent: CookieConsent | null = null;

function getConsentSnapshot(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedConsent;
  cachedRaw = raw;
  cachedConsent = readConsent();
  return cachedConsent;
}

const SSR_NULL: null = null;
function getServerConsentSnapshot(): null {
  return SSR_NULL;
}

// Mount detection — SSR'de false, client'ta true. Hydration mismatch'i
// engellemek icin banner sadece mount sonrasi gorunur. useSyncExternalStore
// kullaniliyor cunku useEffect+setState ile (React 19 lint kurali).
function subscribeMounted() {
  return () => {};
}
function getMountedSnapshot() {
  return true;
}
function getServerMountedSnapshot() {
  return false;
}

export function CookieConsentBanner() {
  // Persistent consent — null = hic onay verilmemis (banner gorunmeli).
  // Cache'lenmis snapshot ile React'in infinite-loop tespitini geciyoruz.
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getServerConsentSnapshot
  );

  // Hydration mismatch'i engellemek icin SSR + ilk client render'da banner
  // ASLA gorunmez. Mount sonrasi banner consent durumuna gore gorunur.
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getServerMountedSnapshot
  );
  const [reopen, setReopen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);
  const [marketing, setMarketing] = useState(consent?.marketing ?? false);

  // "Cerez Tercihleri" footer linki banner'i tekrar acmak icin event yayinlar.
  useEffect(() => {
    const handler = () => {
      const cur = readConsent();
      setAnalytics(cur?.analytics ?? false);
      setMarketing(cur?.marketing ?? false);
      setShowSettings(true);
      setReopen(true);
    };
    window.addEventListener("me-cookie-consent-open", handler);
    return () => window.removeEventListener("me-cookie-consent-open", handler);
  }, []);

  const open = mounted && (!consent || reopen);

  const acceptAll = useCallback(() => {
    writeConsent({ analytics: true, marketing: true });
    setReopen(false);
  }, []);

  const rejectOptional = useCallback(() => {
    writeConsent({ analytics: false, marketing: false });
    setReopen(false);
  }, []);

  const saveSelection = useCallback(() => {
    writeConsent({ analytics, marketing });
    setReopen(false);
  }, [analytics, marketing]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
            <span aria-hidden="true" className="text-2xl">
              🍪
            </span>
          </div>
          <div className="flex-1">
            <h2
              id="cookie-consent-title"
              className="text-base font-semibold text-neutral-900 sm:text-lg"
            >
              Cerez Tercihleri
            </h2>
            <p
              id="cookie-consent-desc"
              className="mt-1 text-xs leading-relaxed text-neutral-600 sm:text-sm"
            >
              Site deneyiminizi iyilestirmek icin cerezler kullaniyoruz. Zorunlu
              cerezler her zaman acik; diger cerezler icin tercihinizi
              belirleyebilirsiniz.{" "}
              <Link
                href="/cerez-politikasi"
                className="font-medium text-neutral-900 underline underline-offset-2 hover:text-brand-gold-dark"
              >
                Cerez Politikasi
              </Link>
            </p>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="space-y-2.5 border-b border-neutral-100 bg-neutral-50/50 px-5 py-4 sm:px-6">
            <ConsentRow
              title="Zorunlu cerezler"
              desc="Oturum, sepet, guvenlik. Kapatilamaz."
              checked={true}
              disabled
              onChange={() => {}}
            />
            <ConsentRow
              title="Analitik cerezler"
              desc="Site kullanim istatistiklerini olcer (anonim)."
              checked={analytics}
              onChange={setAnalytics}
            />
            <ConsentRow
              title="Pazarlama cerezleri"
              desc="Ilgi alaninza gore icerik / kampanya gosterir."
              checked={marketing}
              onChange={setMarketing}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="text-xs font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900 sm:text-sm"
          >
            {showSettings ? "Tercihleri gizle" : "Tercihleri ozellestir"}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
            <button
              type="button"
              onClick={rejectOptional}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 cursor-pointer"
            >
              Sadece zorunlu
            </button>
            {showSettings ? (
              <button
                type="button"
                onClick={saveSelection}
                className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 cursor-pointer"
              >
                Tercihleri kaydet
              </button>
            ) : (
              <button
                type="button"
                onClick={acceptAll}
                className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-neutral-900 shadow-sm transition-colors hover:bg-brand-gold-dark cursor-pointer"
              >
                Tumunu kabul et
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsentRow({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        disabled
          ? "border-neutral-200 bg-white opacity-80"
          : checked
            ? "border-neutral-300 bg-white"
            : "border-neutral-200 bg-white hover:border-neutral-300"
      } ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-neutral-900 disabled:cursor-default"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-neutral-900">
          {title}
          {disabled && (
            <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
              Her zaman acik
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-neutral-500">{desc}</span>
      </span>
    </label>
  );
}

/**
 * Footer/baska yerden tekrar acma — kullanici "Cerez Tercihleri" linkine
 * tikladiginda banner tekrar gorunsun. Custom event dispatch.
 */
export function ReopenCookieConsent({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("me-cookie-consent-open"));
      }}
      className={
        className ??
        "text-sm text-neutral-600 transition-colors hover:text-neutral-900 cursor-pointer"
      }
    >
      {children ?? "Cerez Tercihleri"}
    </button>
  );
}
