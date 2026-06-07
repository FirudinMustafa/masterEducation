import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealerSidebar, DealerMobileHeader } from "@/components/bayi/sidebar";

// Routes reachable even when the dealer is PENDING/REJECTED/SUSPENDED.
// Letting pending applicants upload paperwork while waiting for approval
// shortens the back-and-forth with the admin team.
const PATHS_ALLOWED_WHEN_UNAPPROVED = ["/bayi/belgeler"];

function isAllowedUnapprovedPath(pathname: string): boolean {
  if (!pathname) return false;
  // exact-match veya alt-segment (querystring/trailing slash dahil)
  return PATHS_ALLOWED_WHEN_UNAPPROVED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`),
  );
}

export default async function DealerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "DEALER") {
    redirect("/giris");
  }

  // Live DB lookup — never trust the JWT-cached dealerStatus. An admin
  // approval should reflect on the very next /bayi page render without the
  // dealer logging out/in. We pull rejectionReason/notes in the same query
  // so the unapproved branch already has what it needs to render details.
  const liveDealer = session.user.dealerId
    ? await prisma.dealer.findUnique({
        where: { id: session.user.dealerId },
        select: { status: true, rejectionReason: true, notes: true },
      })
    : null;
  const dealerStatus = liveDealer?.status ?? session.user.dealerStatus;
  const hdrs = await headers();
  // Next.js 16 — pathname'i birden fazla yerden dene; proxy.ts 'x-pathname'
  // ekliyor, ama bazi durumlarda (RSC payload, redirect chain) bos olabilir.
  // Fallback olarak `next-url` ve `referer`'i tara.
  const rawPath =
    hdrs.get("x-pathname") ||
    hdrs.get("x-invoke-path") ||
    hdrs.get("next-url") ||
    "";
  let pathname = rawPath;
  if (!pathname) {
    const ref = hdrs.get("referer") || "";
    try {
      if (ref) pathname = new URL(ref).pathname;
    } catch {
      /* ignore */
    }
  }
  const allowUnapproved = isAllowedUnapprovedPath(pathname);

  if (dealerStatus !== "APPROVED" && !allowUnapproved) {
    const dealer = liveDealer;

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
          {dealerStatus === "PENDING" ? "Basvurunuz Inceleniyor" :
           dealerStatus === "REJECTED" ? "Basvurunuz Reddedildi" :
           "Hesabiniz Askiya Alindi"}
        </h1>
        <p className="text-brand-muted mb-6">
          {dealerStatus === "PENDING"
            ? "Bayi basvurunuz inceleme asamasindadir. En kisa surede size donecegiz."
            : "Detayli bilgi icin bizimle iletişime gecebilirsiniz."}
        </p>

        {dealerStatus === "REJECTED" && dealer?.rejectionReason && (
          <div className="mx-auto max-w-md mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-left text-red-800">
            <p className="font-semibold mb-1">Red sebebi</p>
            <p className="whitespace-pre-wrap">{dealer.rejectionReason}</p>
          </div>
        )}

        {dealerStatus === "SUSPENDED" && dealer?.notes && (
          <div className="mx-auto max-w-md mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-left text-amber-900">
            <p className="font-semibold mb-1">Açıklama</p>
            <p className="whitespace-pre-wrap">{dealer.notes}</p>
          </div>
        )}

        {dealerStatus === "PENDING" && (
          <Link
            href="/bayi/belgeler"
            className="inline-flex items-center px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark"
          >
            Belgelerinizi yükleyin &rarr;
          </Link>
        )}
      </div>
    );
  }

  // Sidebar firma adi + ödeme modu — para/bakiye gösterimi kaldirildi.
  const dealerInfo = session.user.dealerId
    ? await prisma.dealer.findUnique({
        where: { id: session.user.dealerId },
        select: {
          paymentTerms: true,
          companyName: true,
        },
      })
    : null;

  const dealerProps = {
    paymentTerms: dealerInfo?.paymentTerms ?? "OPEN_ACCOUNT",
    companyName: dealerInfo?.companyName ?? "",
  } as const;

  return (
    <div className="flex min-h-[calc(100vh-7rem)]">
      <DealerSidebar {...dealerProps} />
      <div className="flex-1 bg-gray-50 flex flex-col">
        <DealerMobileHeader {...dealerProps} />
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
