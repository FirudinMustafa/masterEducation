import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import type { OrderEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { carrierLabel, carrierTrackingUrl } from "@/lib/cargo-carriers";
import { rateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Kargo Takibi" };

interface PageProps {
  params: Promise<{ no: string }>;
}

/**
 * Privacy: alici adi tamamen gösterilmez (KVKK + tracking no enumeration
 * sonrasi profil oluşturma riski). "Ali Veli Demir" → "Ali V. D.".
 */
function maskShippingName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  return [parts[0], ...parts.slice(1).map((p) => `${p[0]}.`)].join(" ");
}

// Görünum icin, OrderStatus'e paralel 5 adımli takvim. Her adım,
// ilgili OrderEvent (varsa) tarihiyle doldurulur; yoksa gri kalir.
const TIMELINE_ORDER: Array<{ type: OrderEventType; label: string }> = [
  { type: "CREATED", label: "Sipariş alindi" },
  { type: "APPROVED", label: "Sipariş onaylandi" },
  { type: "PROCESSING", label: "Hazirlaniyor" },
  { type: "SHIPPED", label: "Kargoya verildi" },
  { type: "DELIVERED", label: "Teslim edildi" },
];

export default async function TrackingPage({ params }: PageProps) {
  const { no } = await params;

  // Brute-force tracking number enumeration korumasi: per-IP saatte 30 sorgu.
  // Gercek kullanıcı tipik olarak 1-3 tracking takip eder; 30 yeterli marj.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`tracking:${ip}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) {
    notFound(); // 429 yerine 404 — saldirgana endpoint varligini sizdirma
  }

  const order = await prisma.order.findFirst({
    where: { trackingNumber: no },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      shippedAt: true,
      deliveredAt: true,
      estimatedDeliveryAt: true,
      createdAt: true,
      trackingCarrier: true,
      trackingCarrierName: true,
      trackingNumber: true,
      shippingCity: true,
      shippingName: true,
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order) notFound();

  const carrierDisplay = carrierLabel(
    order.trackingCarrier,
    order.trackingCarrierName,
  );
  const carrierUrl = carrierTrackingUrl(
    order.trackingCarrier,
    order.trackingNumber,
  );

  // Her type icin ilk event'i al (varsa). NOTE'lar timeline'in altinda
  // ayri bir bolumde gösterilir.
  const firstEventByType = new Map<OrderEventType, typeof order.events[number]>();
  for (const ev of order.events) {
    if (!firstEventByType.has(ev.type)) {
      firstEventByType.set(ev.type, ev);
    }
  }
  const notes = order.events.filter((e) => e.type === "NOTE");

  const currentIdx = TIMELINE_ORDER.findIndex(
    (s) => s.type === mapStatusToEventType(order.status),
  );
  const isCancelled = order.status === "CANCELLED";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Kargo Takibi
            </p>
            <h1 className="text-xl font-display font-bold text-brand-black">
              {carrierDisplay}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Takip No</p>
            <p className="font-mono text-sm">{no}</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Sipariş No</span>
            <span className="font-mono">{order.orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Alici</span>
            <span>{maskShippingName(order.shippingName)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Şehir</span>
            <span>{order.shippingCity}</span>
          </div>
          {order.estimatedDeliveryAt && order.status !== "DELIVERED" && (
            <div className="flex justify-between">
              <span className="text-gray-500">Tahmini Teslim</span>
              <span className="font-medium">
                {new Date(order.estimatedDeliveryAt).toLocaleDateString("tr-TR")}
              </span>
            </div>
          )}
        </div>

        {carrierUrl && (
          <a
            href={carrierUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-black hover:bg-brand-gold-dark"
          >
            {carrierDisplay} sitesinde takip et
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        )}

        {isCancelled ? (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
            Sipariş iptal edildi.
            {firstEventByType.get("CANCELLED")?.createdAt && (
              <span className="ml-1 text-rose-600">
                ({new Date(firstEventByType.get("CANCELLED")!.createdAt).toLocaleString("tr-TR")})
              </span>
            )}
          </div>
        ) : (
          <ol className="relative border-l-2 border-gray-200 ml-3 space-y-4">
            {TIMELINE_ORDER.map((step, i) => {
              const event = firstEventByType.get(step.type);
              const done = event != null || i < currentIdx;
              const active = i === currentIdx;
              return (
                <li key={step.type} className="pl-4 pb-2 relative">
                  <span
                    className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${
                      done
                        ? "bg-brand-gold border-brand-gold"
                        : active
                          ? "bg-white border-brand-gold animate-pulse"
                          : "bg-white border-gray-300"
                    }`}
                  />
                  <p
                    className={`text-sm ${
                      done || active
                        ? "text-brand-black font-medium"
                        : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  {event?.createdAt && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(event.createdAt).toLocaleString("tr-TR")}
                    </p>
                  )}
                  {event?.note && (
                    <p className="text-xs text-gray-600 mt-1 italic">
                      {event.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {notes.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Bildirimler
            </h2>
            <ul className="space-y-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="text-xs text-gray-700 bg-gray-50 rounded-md px-3 py-2"
                >
                  <span className="text-gray-400">
                    {new Date(n.createdAt).toLocaleString("tr-TR")} —{" "}
                  </span>
                  {n.note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!carrierUrl && order.trackingCarrier === null && (
          <p className="text-xs text-gray-400 mt-6 text-center">
            Kargo firmasi henuz atanmadi. Atandigi anda bu sayfada link olarak
            görünecektir.
          </p>
        )}
      </div>

      <div className="text-center mt-4">
        <Link
          href="/"
          className="text-sm text-brand-muted hover:text-brand-black"
        >
          &larr; Anasayfa
        </Link>
      </div>
    </div>
  );
}

function mapStatusToEventType(
  status: "PENDING" | "APPROVED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED",
): OrderEventType {
  switch (status) {
    case "PENDING":
      return "CREATED";
    case "APPROVED":
      return "APPROVED";
    case "PROCESSING":
      return "PROCESSING";
    case "SHIPPED":
      return "SHIPPED";
    case "DELIVERED":
      return "DELIVERED";
    case "CANCELLED":
      return "CANCELLED";
  }
}
