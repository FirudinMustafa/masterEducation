/**
 * KolayBi e-fatura entegrasyonu — adapter.
 *
 * Auth flow (3 adım):
 *   1. API anahtarı: KolayBi panel → Ayarlar → Profil Hesabı → API Anahtarları
 *   2. Channel: api.support@kolaybi.com'dan talep et
 *   3. Access token: POST /kolaybi/v1/access_token, body { api_key }, header Channel.
 *      Token 24 saat geçerli — bellekte cache'le, expires-at ile otomatik refresh.
 *
 * Sandbox: https://ofis-sandbox-api.kolaybi.com (default)
 * Prod:    https://ofis-api.kolaybi.com
 *
 * `KOLAYBI_API_KEY` veya `KOLAYBI_CHANNEL` env'de yoksa adapter **DRYRUN**
 * moduna geçer: `isConfigured()` → false. Caller (invoice service) DB'ye
 * kayıt atar ama dış istek yapmaz; ileride env dolduğunda cron retry'lar
 * ile gönderilir.
 *
 * Docs:
 *   - https://developer.kolaybi.com/docs/getting-started/
 *   - https://developer.kolaybi.com/docs/auth/intro/
 *   - https://developer.kolaybi.com/docs/auth/environments/
 *   - https://developer.kolaybi.com/docs/invoices/create/
 */

// 24h TTL'den 2h margin — token expiration sırasında istek atılırsa
// fail edilmemesi için. Network gecikmeleri + concurrent istekler düşünüldü.
const TOKEN_TTL_MS = 22 * 60 * 60 * 1000;

type TokenCache = {
  token: string;
  expiresAt: number;
};

let _tokenCache: TokenCache | null = null;
// Concurrent 401 durumunda paralel iki refresh önleme — single-flight pattern.
// Birinci request token'ı yenilerken diğerleri aynı promise'i bekler.
let _tokenRefreshInflight: Promise<string> | null = null;

/**
 * KolayBi response body'lerinde / error body'lerinde sızması istenmeyen
 * key'leri redact et. Audit/log'larda hassas alanlar görünmesin.
 */
const SENSITIVE_BODY_KEYS = /api[_-]?key|token|secret|channel|authorization|bearer|password/i;
function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "..." : value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_BODY_KEYS.test(k) ? "[REDACTED]" : redactSensitive(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function isConfigured(): boolean {
  return Boolean(process.env.KOLAYBI_API_KEY && process.env.KOLAYBI_CHANNEL);
}

/**
 * Mock mode: env yok ama testleri sandbox-eşlik şekilde simüle etmek için.
 * `KOLAYBI_MOCK=true` set edildiğinde adapter gerçek HTTP atmadan deterministik
 * synthetic ID'ler döndürür. CI/staging'de credentials gelene kadar
 * end-to-end test akışını sürdürür. Prod'da false olmalı.
 */
export function isMockMode(): boolean {
  return (
    process.env.KOLAYBI_MOCK === "true" || process.env.KOLAYBI_MOCK === "1"
  );
}

/**
 * Mock mode'da `isConfigured()` true sayılsın diye kullanılır — invoice service
 * "DRYRUN değil, gönderim dene" yoluna girer ama kolaybi adapter mock döndürür.
 */
export function isOperational(): boolean {
  return isConfigured() || isMockMode();
}

// Mock state — testlerde inspect edilebilir
const mockState = {
  contactSeq: 1000,
  addressSeq: 2000,
  productSeq: 3000,
  invoiceSeq: 4000,
  calls: [] as { method: string; path: string; body?: unknown }[],
};
export function _resetMockState(): void {
  mockState.contactSeq = 1000;
  mockState.addressSeq = 2000;
  mockState.productSeq = 3000;
  mockState.invoiceSeq = 4000;
  mockState.calls = [];
}
export function _getMockCalls() {
  return [...mockState.calls];
}

function baseUrl(): string {
  const u = process.env.KOLAYBI_BASE_URL || "https://ofis-sandbox-api.kolaybi.com";
  // Plaintext HTTP yasak — credential leakage MITM riski. Localhost dahil
  // sandbox/prod URL'leri her zaman HTTPS olmali.
  if (!u.startsWith("https://")) {
    throw new KolaybiError(
      `KOLAYBI_BASE_URL must use HTTPS (got "${u.split(":")[0]}://...")`,
      0,
    );
  }
  return u;
}

function channel(): string {
  const c = process.env.KOLAYBI_CHANNEL;
  if (!c) throw new Error("KOLAYBI_CHANNEL not set");
  return c;
}

function apiKey(): string {
  const k = process.env.KOLAYBI_API_KEY;
  if (!k) throw new Error("KOLAYBI_API_KEY not set");
  return k;
}

/**
 * Access token al — single-flight pattern: aynı anda paralel 401 alan
 * isteklerden yalnız biri refresh yapar, diğerleri aynı promise'i bekler.
 *
 * Concurrent safety: race condition ile çift /access_token isteği gitmez
 * (KolayBi rate limit'i tetiklenmez, audit gürültüsü olmaz).
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now) {
    return _tokenCache.token;
  }
  // Refresh halen sürüyorsa onu bekle — ikinci istek atma
  if (_tokenRefreshInflight) {
    return _tokenRefreshInflight;
  }
  _tokenRefreshInflight = (async () => {
    try {
      const res = await fetch(`${baseUrl()}/kolaybi/v1/access_token`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Channel: channel(),
        },
        body: JSON.stringify({ api_key: apiKey() }),
      });
      if (!res.ok) {
        const body = await parseErrorBody(res);
        throw new KolaybiError(
          `KolayBi auth failed (${res.status})`,
          res.status,
          body,
        );
      }
      const data = (await res.json()) as { data: string };
      if (!data?.data || typeof data.data !== "string") {
        throw new KolaybiError("Auth response missing data field", res.status);
      }
      _tokenCache = { token: data.data, expiresAt: Date.now() + TOKEN_TTL_MS };
      return data.data;
    } finally {
      _tokenRefreshInflight = null;
    }
  })();
  return _tokenRefreshInflight;
}

export function _resetTokenCache(): void {
  _tokenCache = null;
}

/**
 * KolayBi'nin tipik hata yapısını sarmalayan exception.
 *
 * Sandbox üzerinde gözlemlenen format:
 *   { data: [], code: 10401, message: "...", description: "...", success: false }
 *
 * code haritası (gözlemlenen):
 *   10400 — Bad request / missing field
 *   10401 — Auth: token yok/expired
 *   10404 — Resource not found (channel/record)
 */
export class KolaybiError extends Error {
  status: number;
  /** Sanitize edilmiş body — apiKey/token/Channel gibi alanlar [REDACTED] */
  body?: unknown;
  /** KolayBi'nin response'undaki numeric code (örn. 10401) */
  apiCode?: number;
  /** Server tarafının kullanıcıya gösterilebilir mesajı */
  apiMessage?: string;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "KolaybiError";
    this.status = status;
    // Body'i sanitize ederek sakla — log/audit'lere düşse bile credential sızmaz
    this.body = body !== undefined ? redactSensitive(body) : undefined;
    if (body && typeof body === "object") {
      const b = body as { code?: unknown; description?: unknown; message?: unknown };
      if (typeof b.code === "number") this.apiCode = b.code;
      if (typeof b.description === "string") this.apiMessage = b.description;
      else if (typeof b.message === "string") this.apiMessage = b.message;
    }
  }

  /** Token süresi bitmiş — yeni token alıp retry mantıklı. */
  get isExpiredToken(): boolean {
    return this.status === 401 && this.apiCode === 10401;
  }

  /** Channel/key konfigürasyon hatası — retry yapma, admin'e bildir. */
  get isConfigError(): boolean {
    return (
      this.apiCode === 10404 &&
      typeof this.apiMessage === "string" &&
      /kanal/i.test(this.apiMessage)
    );
  }
}

async function parseErrorBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Authenticated fetch — token'ı cache'ten alır, 401 alırsa cache invalidate
 * + 1 retry yapar. Diğer hatalarda KolaybiError fırlatır.
 *
 * Mock mode aktifse gerçek HTTP atmaz; deterministik synthetic response
 * döndürür (testler için).
 */
export async function authedFetch(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<unknown> {
  if (isMockMode()) {
    return mockResponse(path, init);
  }
  if (!isConfigured()) {
    throw new KolaybiError("KolayBi not configured (DRYRUN mode)", 0);
  }
  const url = `${baseUrl()}${path}`;
  const callOnce = async (forceRefresh: boolean): Promise<Response> => {
    if (forceRefresh) _resetTokenCache();
    const token = await getAccessToken();
    return fetch(url, {
      method: init.method ?? "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        Channel: channel(),
        ...(init.headers ?? {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  };

  let res = await callOnce(false);
  // 401 + 10401 = expired token: cache invalidate + 1 retry
  // (KolayBi'nin 401'i sadece auth'la sınırlı; channel hatası 404 verir)
  if (res.status === 401) {
    res = await callOnce(true);
  }
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new KolaybiError(
      `KolayBi ${init.method ?? "POST"} ${path} → ${res.status}`,
      res.status,
      body,
    );
  }
  return res.json();
}

/**
 * Network connectivity probe — sandbox erişimi var mı, doğru error format
 * mı dönüyor mu? Credentials gerektirmez (geçersiz channel ile prober eder
 * ve 404 + apiCode 10404 bekler). Health check / smoke test.
 */
export async function probeConnectivity(): Promise<{
  reachable: boolean;
  authEndpointResponds: boolean;
  errorFormatMatches: boolean;
  details?: string;
}> {
  try {
    const res = await fetch(`${baseUrl()}/kolaybi/v1/access_token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Channel: "PROBE_NONEXISTENT_CHANNEL",
      },
      body: JSON.stringify({ api_key: "probe-invalid" }),
    });
    const body = (await parseErrorBody(res)) as
      | { code?: number; success?: boolean }
      | undefined;
    return {
      reachable: true,
      authEndpointResponds: res.status >= 200 && res.status < 600,
      errorFormatMatches:
        body?.success === false && typeof body?.code === "number",
      details: `status=${res.status} code=${body?.code}`,
    };
  } catch (err) {
    return {
      reachable: false,
      authEndpointResponds: false,
      errorFormatMatches: false,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Invoices API ────────────────────────────────────────

export type KolaybiInvoiceItem = {
  product_id: number;
  quantity: string;
  unit_price: string;
  vat_rate: number;
  description?: string;
  discount_amount?: string;
};

export type KolaybiInvoicePayload = {
  contact_id: number;
  address_id: number;
  order_date: string; // YYYY-MM-DD
  currency: string; // "try"
  items: KolaybiInvoiceItem[];
  serial_no?: string;
  due_date?: string;
  description?: string;
  receiver_email?: string;
  type?: string; // default "sale_invoice"
  document_scenario?: "TICARIFATURA" | "TEMELFATURA" | "ILAC_TIBBICIHAZ";
  document_type?: "SATIS" | "ISTISNA" | "TEVKIFAT" | "OZELMATRAH" | "IHRACKAYITLI";
  tracking_currency?: string;
  /** Tag ID'leri (önceden oluşturulmuş — string yerine number) */
  tags?: number[];
  project_id?: number;
  subtotal_discount_amount?: number;
  subtotal_correction_amount?: number;
  /** İnternet satışı bilgisi — e-ticaret faturalarında doldurmak best-practice */
  internet_sale?: {
    url?: string;
    payment_type?: "credit-card" | "bank-transfer" | "pay-at-door" | "payment-platform";
    payment_platform?: string;
    payment_date?: string; // YYYY-MM-DD
  };
  /** Sipariş referansı — bizim orderNumber'i KolayBi tarafına geçirir */
  order_reference?: {
    serial_no?: string;
    issue_date?: string; // YYYY-MM-DD
  };
};

export type KolaybiInvoiceResponse = {
  document_id: number;
  grand_total: number;
  grand_currency: string;
  exchange_grand_total?: number;
  exchange_grand_currency?: string;
};

/**
 * POST /kolaybi/v1/invoices — fatura oluştur.
 *
 * NOT: Bu endpoint'e gitmek için contact_id, address_id, product_id'lerin
 * zaten KolayBi tarafında oluşturulmuş olması gerekir. Caller (invoice
 * service) bunu önceden ensure etmeli (ensureContact, ensureProduct,
 * ensureAddress). Bu helper'lar şimdilik scope dışı — Faz 4 sürdürülebilir
 * kod için ayrı PR'da gelecek.
 */
export async function createInvoice(
  payload: KolaybiInvoicePayload,
): Promise<KolaybiInvoiceResponse> {
  const data = (await authedFetch("/kolaybi/v1/invoices", {
    method: "POST",
    body: payload,
  })) as { data: KolaybiInvoiceResponse };
  return data.data;
}

// ─── Associates (contact) API ────────────────────────────

export type KolaybiAssociateAddress = {
  /** Açık adres */
  address?: string;
  /** Şehir (zorunlu) */
  city: string;
  /** İlçe (zorunlu) */
  district: string;
  /** Ülke (zorunlu) */
  country?: string;
  address_type?: "invoice" | "shipping";
  is_abroad?: boolean;
  postal_code?: string;
  building_name?: string;
  number?: number;
  street?: string;
};

export type KolaybiContactPayload = {
  name: string;
  surname: string;
  identity_no: string; // 10-11 hane
  is_corporate?: boolean;
  associate_type?: string; // default "customer" (KolayBi terim — alıcı)
  tax_office?: string;
  email?: string;
  phone?: string;
  code?: string;
  website?: string;
  /** KolayBi tag ID'leri (önceden oluşturulmuş, number) */
  tags?: number[];
  /** Adres associate ile birlikte eklenebilir; response'tan address[0].id alınır. */
  addresses?: KolaybiAssociateAddress[];
};

export type KolaybiContactResponse = {
  id: number;
  name: string;
  identity_no: string;
  /** Embedded address response — KolayBi `address: [{...}]` (singular!) döner. */
  address?: Array<{
    id: number;
    address?: string;
    city?: string;
    district?: string;
    address_type?: string;
  }>;
};

export async function createContact(
  payload: KolaybiContactPayload,
): Promise<KolaybiContactResponse> {
  const data = (await authedFetch("/kolaybi/v1/associates", {
    method: "POST",
    body: payload,
  })) as { data: KolaybiContactResponse };
  return data.data;
}

// ─── Address API (associate'e ek adres eklemek için) ──────

export type KolaybiAddressCreatePayload = {
  associate_id: number;
  city: string;
  district: string;
  country?: string;
  address?: string;
  address_type?: "invoice" | "shipping";
  is_abroad?: boolean;
  street?: string;
  building_name?: string;
  number?: number;
  postal_code?: string;
};

export type KolaybiAddressResponse = {
  id: number;
  associate_id: number;
  city: string;
  district: string;
};

/**
 * Mevcut bir associate'e ek adres oluştur. associate ile birlikte adres
 * gönderildiyse genelde gerekmez — bu helper, fatura adresi farklıysa
 * sonradan eklemek için.
 */
export async function createAddress(
  payload: KolaybiAddressCreatePayload,
): Promise<KolaybiAddressResponse> {
  const data = (await authedFetch("/kolaybi/v1/address/create", {
    method: "POST",
    body: payload,
  })) as { data: KolaybiAddressResponse };
  return data.data;
}

// ─── Products API ────────────────────────────────────────

export type KolaybiProductPayload = {
  name: string;
  code?: string;
  barcode?: string;
  description?: string;
  product_type?: string; // default "good"
  vat_rate?: number; // default 20
  price?: number;
  price_currency?: string;
  sale_price_vat_included?: boolean;
};

export type KolaybiProductResponse = {
  id: number;
  name: string;
  code?: string;
};

export async function createProduct(
  payload: KolaybiProductPayload,
): Promise<KolaybiProductResponse> {
  const data = (await authedFetch("/kolaybi/v1/products", {
    method: "POST",
    body: payload,
  })) as { data: KolaybiProductResponse };
  return data.data;
}

// ─── Mock response ───────────────────────────────────────

function mockResponse(
  path: string,
  init: { method?: string; body?: unknown },
): unknown {
  mockState.calls.push({ method: init.method ?? "POST", path, body: init.body });
  // Auth — never via authedFetch but kept for completeness
  if (path === "/kolaybi/v1/access_token") {
    return { data: "MOCK_TOKEN_eyJhbGciOiJIUzI1NiJ9" };
  }
  if (path === "/kolaybi/v1/associates") {
    const id = mockState.contactSeq++;
    const body = (init.body ?? {}) as KolaybiContactPayload;
    // Eger payload'da addresses varsa response'ta address: [{id, ...}] don —
    // gerçek API'nin davranışını taklit ediyoruz.
    const addressArr =
      body.addresses && body.addresses.length > 0
        ? body.addresses.map((a) => ({
            id: mockState.addressSeq++,
            address: a.address,
            city: a.city,
            district: a.district,
            address_type: a.address_type ?? "invoice",
          }))
        : undefined;
    return {
      data: {
        id,
        name: body.name ?? `Mock Contact ${id}`,
        identity_no: body.identity_no ?? "0000000000",
        ...(addressArr ? { address: addressArr } : {}),
      },
    };
  }
  if (path === "/kolaybi/v1/address/create") {
    const id = mockState.addressSeq++;
    const body = (init.body ?? {}) as KolaybiAddressCreatePayload;
    return {
      data: {
        id,
        associate_id: body.associate_id,
        city: body.city,
        district: body.district,
      },
    };
  }
  if (path === "/kolaybi/v1/products") {
    const id = mockState.productSeq++;
    const body = (init.body ?? {}) as KolaybiProductPayload;
    return {
      data: { id, name: body.name ?? `Mock Product ${id}`, code: body.code },
    };
  }
  if (path === "/kolaybi/v1/invoices") {
    const id = mockState.invoiceSeq++;
    const body = (init.body ?? {}) as KolaybiInvoicePayload;
    const total = body.items.reduce(
      (s, i) => s + Number(i.unit_price) * Number(i.quantity),
      0,
    );
    return {
      data: {
        document_id: id,
        grand_total: total,
        grand_currency: body.currency ?? "try",
      },
    };
  }
  // Unknown path — emulate KolayBi 404
  throw new KolaybiError(`Mock: unknown path ${path}`, 404, {
    data: [],
    code: 10404,
    message: "Kayıt bulunamadı.",
    description: "Kayıt bulunamadı.",
    success: false,
  });
}
