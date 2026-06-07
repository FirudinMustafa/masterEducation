"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/stores/cart-store";
import { ProductImage } from "@/components/products/product-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartRefreshBanner } from "@/components/cart/cart-refresh-banner";
import { LocationPicker } from "@/components/location-picker";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Step = "info" | "payment" | "confirm";

interface SavedAddress {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  postalCode: string | null;
  addressLine: string;
  isDefault: boolean;
}

export default function CheckoutPage() {
  const { items, note, getSubtotal, clearCart } = useCartStore();
  const { data: session, status } = useSession();
  const router = useRouter();

  // Bayi-only: sipariş yalnız giriş yapmış bayilere açık. Bayi olmayan
  // ziyaretçi/müşteri ödeme sayfasına erişemez, girişe yönlendirilir.
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || session.user.role !== "DEALER") {
      router.replace("/giris?callbackUrl=/odeme");
    }
  }, [status, session, router]);

  const [step, setStep] = useState<Step>("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Alan bazlı (anlık) doğrulama — kullanıcı alandan çıkınca (onBlur) hata
  // gösterilir, düzeltmeye başlayınca (onChange) temizlenir.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Saved addresses for logged-in users
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | "new">(
    "new"
  );

  // Address/contact form
  const [form, setForm] = useState({
    fullName: session?.user?.name || "",
    email: session?.user?.email || "",
    phone: "",
    city: "",
    district: "",
    postalCode: "",
    address: "",
  });

  // Load saved addresses when a session is available.
  // Not: Kayıtli adres **otomatik olarak form'a prefill edilmez** — kullanıcı
  // "kayıtli bilgi" hissi yasamasin. Kullanıcı kayıtli adresi tiklarsa
  // prefill selectAddress() ile olur.
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    fetch("/api/account/addresses")
      .then((r) => (r.ok ? r.json() : { addresses: [] }))
      .then((data: { addresses: SavedAddress[] }) => {
        if (cancelled) return;
        setSavedAddresses(data.addresses ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  function selectAddress(id: string) {
    setSelectedAddressId(id);
    if (id === "new") {
      setForm({
        fullName: session?.user?.name || "",
        email: session?.user?.email || "",
        phone: "",
        city: "",
        district: "",
        postalCode: "",
        address: "",
      });
      return;
    }
    const a = savedAddresses.find((x) => x.id === id);
    if (a) {
      setForm({
        fullName: a.fullName,
        email: session?.user?.email || form.email,
        phone: a.phone,
        city: a.city,
        district: a.district,
        postalCode: a.postalCode ?? "",
        address: a.addressLine,
      });
    }
  }

  // OPEN_ACCOUNT bayi varsayilan olarak acik hesap, diger herkes kart kullanir.
  const isOpenAccountDealer =
    session?.user?.role === "DEALER" &&
    session.user.dealerPaymentTerms === "OPEN_ACCOUNT";
  const isDealer = session?.user?.role === "DEALER";

  // Payment form
  const [payment, setPayment] = useState({
    method: (isOpenAccountDealer ? "OPEN_ACCOUNT" : "CREDIT_CARD") as
      | "CREDIT_CARD"
      | "OPEN_ACCOUNT",
    cardNumber: "",
    cardName: "",
    expiry: "",
    cvv: "",
  });

  // Yasal sözleşmelerin onayi (zorunlu).
  const [contractsAccepted, setContractsAccepted] = useState(false);

  // Okul adı — yalnız bayi siparişlerinde gösterilir ve zorunludur.
  const [schoolName, setSchoolName] = useState("");

  // Session yüklendikten sonra dealer ise method'u acik hesaba çevir.
  useEffect(() => {
    if (isOpenAccountDealer && payment.method === "CREDIT_CARD") {
      setPayment((p) => ({ ...p, method: "OPEN_ACCOUNT" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpenAccountDealer]);

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{
    code: string;
    discount: number;
    shippingDiscount: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const subtotal = getSubtotal();
  // Kupon değerlendirmesi için kargo bazını hesapla (gösterilmez; yalnız
  // /api/coupons/validate çağrısına gönderilir). Bayi her zaman ücretsiz kargo.
  const baseShipping = isDealer ? 0 : subtotal >= 500 ? 0 : 29.9;

  async function applyCoupon() {
    setCouponError(null);
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal, shippingCost: baseShipping }),
    });
    setCouponLoading(false);
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      discount?: number;
      shippingDiscount?: number;
      error?: string;
    };
    if (!res.ok || !data.code) {
      setCouponError(data.error ?? "Kupon uygulanamadi.");
      return;
    }
    setCoupon({
      code: data.code,
      discount: data.discount ?? 0,
      shippingDiscount: data.shippingDiscount ?? 0,
    });
  }

  function clearCoupon() {
    setCoupon(null);
    setCouponInput("");
    setCouponError(null);
  }

  // Bos sepet kontrolu — confirm step'inden ONCE yapilmamali. OPEN_ACCOUNT
  // sipariş sonrasi clearCart() cagriliyor, items=[] olur ama step=confirm
  // teskektur ekrani gösterilmeli (bu kontrolden once dusulur degildir).
  if (items.length === 0 && step !== "confirm") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-warm-gray flex items-center justify-center">
          <svg className="w-10 h-10 text-brand-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-bold text-brand-black mb-2">Sepetiniz bos</h1>
        <p className="text-brand-muted mb-6">Ödeme yapmak icin sepetinize ürün ekleyin.</p>
        <Link href="/urunler">
          <Button>Alisverise Basla</Button>
        </Link>
      </div>
    );
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Kullanıcı düzeltmeye başlayınca o alanın hatasını temizle.
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  }

  // Tek alanın doğrulama mesajını döndürür ("" = geçerli).
  function fieldError(field: string, value: string): string {
    const v = value.trim();
    switch (field) {
      case "fullName":
        return v ? "" : "Ad soyad zorunlu.";
      case "email":
        if (!v) return "Email zorunlu.";
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Geçerli bir email girin.";
      case "phone": {
        if (!v) return "Telefon zorunlu.";
        const digits = v.replace(/\D/g, "");
        return digits.length === 10 || digits.length === 11
          ? ""
          : "Telefon 10-11 haneli olmalı (örn: 0 5XX XXX XX XX).";
      }
      case "address":
        return v ? "" : "Adres zorunlu.";
      case "schoolName":
        return v ? "" : "Okul adı zorunlu.";
      default:
        return "";
    }
  }

  function handleBlur(field: string, value: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: fieldError(field, value) }));
  }

  function updatePayment(field: string, value: string) {
    setPayment((prev) => ({ ...prev, [field]: value }));
  }

  function validateInfo(): boolean {
    // Alan bazlı hataları topla → ilgili alanların altında göster.
    const errs: Record<string, string> = {
      fullName: fieldError("fullName", form.fullName),
      email: fieldError("email", form.email),
      phone: fieldError("phone", form.phone),
      address: fieldError("address", form.address),
    };
    if (isDealer) errs.schoolName = fieldError("schoolName", schoolName);
    setFieldErrors((prev) => ({ ...prev, ...errs }));

    if (!form.city) {
      setError("Lütfen il/ilçe seçin.");
      return false;
    }
    if (Object.values(errs).some(Boolean)) {
      setError("Lütfen işaretli alanları düzeltin.");
      return false;
    }
    setError("");
    return true;
  }

  function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validateInfo()) setStep("payment");
  }

  async function handleOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!contractsAccepted) {
      setError(
        "Devam etmek icin Mesafeli Satis Sözleşmesi ve On Bilgilendirme Formu'nu onaylamaniz gerekir."
      );
      return;
    }

    if (payment.method === "CREDIT_CARD") {
      if (!payment.cardNumber || !payment.cardName || !payment.expiry || !payment.cvv) {
        setError("Lütfen kart bilgilerini eksiksiz doldurun.");
        return;
      }
      const digits = payment.cardNumber.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) {
        setError("Kart numarasi 13-19 hane olmali.");
        return;
      }
      // Client-side Luhn (spesifik hata mesaji icin)
      let sum = 0;
      let flip = false;
      for (let i = digits.length - 1; i >= 0; i--) {
        let n = Number(digits[i]);
        if (flip) {
          n *= 2;
          if (n > 9) n -= 9;
        }
        sum += n;
        flip = !flip;
      }
      if (sum % 10 !== 0) {
        setError(
          "Kart numarasi gecersiz (Luhn kontrolu). Mock ödeme icin: 4111 1111 1111 1111"
        );
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(payment.expiry)) {
        setError("Son kullanma tarihi AA/YY formatinda olmali (orn: 12/30).");
        return;
      }
      if (!/^\d{3,4}$/.test(payment.cvv)) {
        setError("CVV 3 veya 4 hane olmali.");
        return;
      }
    }

    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        shipping: {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          city: form.city,
          district: form.district,
          postalCode: form.postalCode,
          address: form.address,
        },
        paymentMethod: payment.method,
        couponCode: coupon?.code ?? null,
        note,
        schoolName: isDealer ? schoolName.trim() : null,
        contractsAccepted,
      };

      if (payment.method === "CREDIT_CARD") {
        body.card = {
          number: payment.cardNumber,
          expiry: payment.expiry,
          cvv: payment.cvv,
          holderName: payment.cardName,
        };
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        paymentUrl?: string;
        requiresPayment?: boolean;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "Sipariş oluşturulamadi.");
      }

      // For CREDIT_CARD we hand off to the mock 3D Secure page which will
      // either confirm the order (and clear the cart) or cancel it.
      if (data.requiresPayment && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      clearCart();
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { key: "info", label: "Teslimat Bilgileri", num: 1 },
    { key: "payment", label: "Ödeme", num: 2 },
    { key: "confirm", label: "Onay", num: 3 },
  ];

  if (step === "confirm") {
    const isDealer = session?.user?.role === "DEALER";
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
          Siparişiniz Alindi!
        </h1>
        <p className="text-brand-muted mb-2">
          Siparişiniz başarıyla oluşturuldu. En kisa surede hazirlanip kargoya
          verilecektir.
        </p>
        <p className="text-sm text-brand-muted mb-6">
          Onay maili kisa sure icinde size ulasacaktir.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {isDealer ? (
            <>
              <Link href="/bayi/siparisler">
                <Button>Bayi Siparişlerim</Button>
              </Link>
              <Link href="/bayi">
                <Button variant="outline">Bayi Paneline Don</Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/urunler">
                <Button>Alisverise Devam Et</Button>
              </Link>
              {session?.user && (
                <Link href="/hesabim/siparislerim">
                  <Button variant="outline">Siparişlerimi Gor</Button>
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-display font-bold text-brand-black mb-5 sm:mb-6">Ödeme</h1>

      <CartRefreshBanner />

      {/* Steps indicator */}
      <div className="flex items-center justify-center mb-6 gap-1 sm:gap-2 sm:mb-8">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-medium transition-colors sm:gap-2 sm:px-3 ${
              step === s.key
                ? "bg-brand-gold text-brand-black"
                : steps.findIndex((x) => x.key === step) > i
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
            }`}>
              <span className="w-5 h-5 rounded-full bg-white/50 flex items-center justify-center text-xs font-bold">
                {steps.findIndex((x) => x.key === step) > i ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-4 h-px bg-gray-200 sm:w-8" />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-8">
        {/* Form */}
        <div className="lg:col-span-2">
          {step === "info" && (
            <form onSubmit={handleInfoSubmit} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-brand-black mb-5">Teslimat Bilgileri</h2>

              {!session?.user && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 text-sm text-blue-700">
                  <Link href="/giris" className="font-semibold underline">Giriş yapin</Link> veya asagidaki bilgileri doldurun.
                </div>
              )}

              {savedAddresses.length > 0 && (
                <div className="mb-5 space-y-2">
                  <p className="text-xs font-medium text-gray-500">
                    Kayıtli adreslerinizden secin
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {savedAddresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectAddress(a.id)}
                        className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                          selectedAddressId === a.id
                            ? "border-brand-gold bg-brand-gold-light/20"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-brand-black">
                            {a.label ?? "Adres"}
                          </span>
                          {a.isDefault && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-brand-gold-light text-brand-black">
                              Varsayilan
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {a.addressLine}
                        </p>
                        <p className="text-xs text-gray-500">
                          {a.district}/{a.city}
                        </p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => selectAddress("new")}
                      className={`p-3 rounded-lg border border-dashed text-left text-sm transition-colors ${
                        selectedAddressId === "new"
                          ? "border-brand-gold bg-brand-gold-light/20"
                          : "border-gray-300 hover:border-gray-400 text-gray-500"
                      }`}
                    >
                      + Yeni adres gir
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Ad Soyad *"
                  value={form.fullName}
                  onChange={(e) => updateForm("fullName", e.target.value)}
                  onBlur={(e) => handleBlur("fullName", e.target.value)}
                  error={fieldErrors.fullName}
                  placeholder="Ad Soyad"
                  required
                />
                <Input
                  label="Email *"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  onBlur={(e) => handleBlur("email", e.target.value)}
                  error={fieldErrors.email}
                  placeholder="ornek@email.com"
                  required
                />
                <Input
                  label="Telefon *"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  onBlur={(e) => handleBlur("phone", e.target.value)}
                  error={fieldErrors.phone}
                  placeholder="0 5XX XXX XX XX"
                  required
                />
                <div className="sm:col-span-2">
                  <LocationPicker
                    province={form.city}
                    district={form.district}
                    onProvinceChange={(city) => updateForm("city", city)}
                    onDistrictChange={(district) => updateForm("district", district)}
                    required
                  />
                </div>
                <Input
                  label="Posta Kodu"
                  value={form.postalCode}
                  onChange={(e) => updateForm("postalCode", e.target.value)}
                  placeholder="34000"
                />
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-brand-black mb-1.5">Adres *</label>
                <textarea
                  value={form.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                  onBlur={(e) => handleBlur("address", e.target.value)}
                  placeholder="Mahalle, sokak, bina no, daire no..."
                  rows={3}
                  required
                  className={`w-full px-4 py-2.5 rounded-lg border bg-white text-brand-black text-sm placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold transition-all resize-none ${
                    fieldErrors.address ? "border-brand-danger" : "border-brand-border"
                  }`}
                />
                {fieldErrors.address && (
                  <p className="mt-1 text-xs text-brand-danger">{fieldErrors.address}</p>
                )}
              </div>

              {isDealer && (
                <div className="mt-4">
                  <Input
                    label="Okul Adı *"
                    value={schoolName}
                    onChange={(e) => {
                      setSchoolName(e.target.value);
                      setFieldErrors((prev) =>
                        prev.schoolName ? { ...prev, schoolName: "" } : prev
                      );
                    }}
                    onBlur={(e) => handleBlur("schoolName", e.target.value)}
                    error={fieldErrors.schoolName}
                    placeholder="Siparişin verildiği okulun tam adı"
                    required
                  />
                  <p className="mt-1.5 text-xs text-brand-muted">
                    Bayi siparişlerinde okul adı zorunludur.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm text-brand-danger bg-red-50 px-3 py-2 rounded-lg mt-4">{error}</p>
              )}

              <div className="mt-6 flex justify-between items-center">
                <Link href="/sepet" className="text-sm text-brand-muted hover:text-brand-black transition-colors">
                  &larr; Sepete Don
                </Link>
                <Button type="submit" size="lg">
                  Ödemeye Gec
                </Button>
              </div>
            </form>
          )}

          {step === "payment" && (
            <form onSubmit={handleOrder} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-brand-black mb-5">Ödeme Yontemi</h2>

              {/* Payment method selection — OPEN_ACCOUNT bayisi yalniz acik hesap
                  gorur, kart secmemeli. PREPAID bayi + tüm musteriler yalniz kart. */}
              <div className="flex gap-3 mb-6">
                {!isOpenAccountDealer && (
                  <button
                    type="button"
                    onClick={() => updatePayment("method", "CREDIT_CARD")}
                    className={`flex-1 p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      payment.method === "CREDIT_CARD"
                        ? "border-brand-gold bg-brand-gold-light/20"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                      </svg>
                      <div>
                        <p className="font-semibold text-sm text-brand-black">Kredi / Banka Karti</p>
                        <p className="text-xs text-gray-500">Guvenli ödeme</p>
                      </div>
                    </div>
                  </button>
                )}

                {isOpenAccountDealer && (
                  <button
                    type="button"
                    onClick={() => updatePayment("method", "OPEN_ACCOUNT")}
                    className={`flex-1 p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      payment.method === "OPEN_ACCOUNT"
                        ? "border-brand-gold bg-brand-gold-light/20"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
                      </svg>
                      <div>
                        <p className="font-semibold text-sm text-brand-black">Acik Hesap</p>
                        <p className="text-xs text-gray-500">Bakiyenizden dusulecek</p>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Credit card form */}
              {payment.method === "CREDIT_CARD" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                    <p className="font-semibold">Test / Mock modu</p>
                    <p>
                      Gercek ödeme gateway&apos;i henuz aktif degil. Test etmek icin:
                    </p>
                    <ul className="list-disc list-inside pl-1">
                      <li>Kart: <strong className="font-mono">4111 1111 1111 1111</strong></li>
                      <li>Son kullanma: <strong className="font-mono">12/30</strong></li>
                      <li>CVV: <strong className="font-mono">123</strong></li>
                      <li>3D Secure OTP: <strong className="font-mono">123456</strong></li>
                    </ul>
                  </div>
                  <Input
                    label="Kart Uzerindeki Isim"
                    value={payment.cardName}
                    onChange={(e) => updatePayment("cardName", e.target.value)}
                    placeholder="AD SOYAD"
                    required
                  />
                  <Input
                    label="Kart Numarasi"
                    value={payment.cardNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 16);
                      const formatted = val.replace(/(\d{4})(?=\d)/g, "$1 ");
                      updatePayment("cardNumber", formatted);
                    }}
                    placeholder="0000 0000 0000 0000"
                    required
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Son Kullanma Tarihi"
                      value={payment.expiry}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, "").slice(0, 4);
                        if (val.length >= 3) val = val.slice(0, 2) + "/" + val.slice(2);
                        updatePayment("expiry", val);
                      }}
                      placeholder="AA/YY"
                      required
                    />
                    <Input
                      label="CVV"
                      value={payment.cvv}
                      onChange={(e) => updatePayment("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="***"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    Kart bilgileriniz 256-bit SSL ile korunmaktadir.
                  </div>
                </div>
              )}

              {payment.method === "OPEN_ACCOUNT" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  Acik hesap ödemesinde siparişiniz onaylandiktan sonra bayi hesabiniza fatura kesilecektir.
                </div>
              )}

              {/* Yasal sözleşme onayi — Mesafeli Satis Sözleşmesi + On Bilgilendirme Formu (zorunlu) */}
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <label className="flex items-start gap-3 cursor-pointer text-sm leading-relaxed text-neutral-800">
                  <input
                    type="checkbox"
                    checked={contractsAccepted}
                    onChange={(e) => setContractsAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-amber-600"
                    required
                  />
                  <span>
                    <Link
                      href="/on-bilgilendirme-formu"
                      target="_blank"
                      className="font-semibold underline underline-offset-2 hover:text-amber-700"
                    >
                      On Bilgilendirme Formu
                    </Link>
                    &apos;nu ve{" "}
                    <Link
                      href="/mesafeli-satis-sozlesmesi"
                      target="_blank"
                      className="font-semibold underline underline-offset-2 hover:text-amber-700"
                    >
                      Mesafeli Satis Sözleşmesi
                    </Link>
                    &apos;ni okudum, kabul ediyorum.{" "}
                    <span className="text-rose-600">*</span>
                  </span>
                </label>
                <p className="mt-2 pl-7 text-xs text-neutral-600">
                  Cayma hakkiniz teslim tarihinden itibaren 14 gün icindir.
                </p>
              </div>

              {error && (
                <p className="text-sm text-brand-danger bg-red-50 px-3 py-2 rounded-lg mt-4">{error}</p>
              )}

              <div className="mt-6 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep("info")}
                  className="text-sm text-brand-muted hover:text-brand-black transition-colors cursor-pointer"
                >
                  &larr; Bilgilere Don
                </button>
                <Button
                  type="submit"
                  size="lg"
                  loading={loading}
                  disabled={!contractsAccepted}
                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siparişi Onayla
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-28">
            <h2 className="text-lg font-semibold text-brand-black mb-4">Sipariş Ozeti</h2>

            {/* Items */}
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <div key={item.productId} className="flex gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-brand-warm-gray shrink-0">
                    <ProductImage
                      src={item.product.imageSrc}
                      alt={item.product.name}
                      width={56}
                      height={56}
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-black truncate">{item.product.name}</p>
                    <p className="text-xs text-brand-muted">{item.quantity} adet</p>
                  </div>
                </div>
              ))}
            </div>

            {note && (
              <div className="text-xs text-brand-muted bg-gray-50 rounded-lg p-2 mb-4">
                <span className="font-medium">Not:</span> {note}
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-2">
              {/* Coupon — bayilere gösterilmez (zaten özel iskonto aliyorlar) */}
              {!isDealer && (
              <div className="pb-2 border-b border-gray-100">
                {coupon ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-700 font-medium">
                      Kupon: {coupon.code}
                    </span>
                    <button
                      onClick={clearCoupon}
                      className="text-xs text-red-600 hover:underline cursor-pointer"
                    >
                      Kaldir
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                      İndirim kuponu
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={couponInput}
                        onChange={(e) =>
                          setCouponInput(e.target.value.toUpperCase())
                        }
                        placeholder="Ornegin: HOSGELDIN10"
                        className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponInput}
                        className="rounded-lg bg-brand-gold px-3 py-2 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                      >
                        {couponLoading ? "..." : "Uygula"}
                      </button>
                    </div>
                    {couponError && (
                      <p className="mt-1 text-xs text-rose-600">{couponError}</p>
                    )}
                    <p className="mt-1 text-[11px] text-neutral-400">
                      Kuponlariniz kargo veya tutar indirimi olabilir.
                    </p>
                  </div>
                )}
              </div>
              )}

              {isDealer && (
                <p className="text-xs text-neutral-500">
                  Bu sipariş cari hesabınıza işlenecektir.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
