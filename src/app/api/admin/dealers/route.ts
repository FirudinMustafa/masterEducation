import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { adminCreateDealerSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { queueEmail, templateAdminCreatedDealer } from "@/lib/email";

/**
 * POST /api/admin/dealers — admin elle bayi oluşturur (e-posta + şifre verir).
 * Self-service başvurudan farklı: admin güvenilir olduğundan email doğrulanmış
 * sayılır ve status varsayılan APPROVED gelir. Bayi bu bilgilerle giriş yapar.
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = adminCreateDealerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 },
    );
  }

  const d = parsed.data;

  // Admin context — enumeration koruması gerekmez; net 409 dön.
  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) {
    return NextResponse.json(
      { error: "Bu e-posta ile bir kullanıcı zaten mevcut." },
      { status: 409 },
    );
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(d.password, 10);
  const isApproved = d.status === "APPROVED";

  const user = await prisma.user.create({
    data: {
      name: d.name,
      email: d.email,
      phone: d.phone,
      passwordHash,
      role: "DEALER",
      // Admin oluşturdu — e-posta doğrulanmış kabul edilir.
      emailVerified: now,
      termsAcceptedAt: now,
      dealer: {
        create: {
          companyName: d.companyName,
          taxOffice: d.taxOffice,
          taxNumber: d.taxNumber,
          tradeRegNo: d.tradeRegNo,
          contactPerson: d.contactPerson,
          status: d.status,
          paymentTerms: d.paymentTerms,
          creditLimit: d.paymentTerms === "PREPAID" ? 0 : d.creditLimit,
          notes: d.notes,
          ...(isApproved
            ? { approvedAt: now, approvedBy: gate.session.user.id }
            : {}),
        },
      },
      ...(d.city && d.district && d.addressLine
        ? {
            addresses: {
              create: {
                label: "Fatura Adresi",
                fullName: d.companyName,
                phone: d.phone,
                city: d.city,
                district: d.district,
                addressLine: d.addressLine,
                isDefault: true,
              },
            },
          }
        : {}),
    },
    include: { dealer: { select: { id: true } } },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_CREATE_ADMIN",
    entityType: "dealer",
    entityId: user.dealer?.id ?? user.id,
    metadata: {
      companyName: d.companyName,
      taxNumber: d.taxNumber,
      email: d.email,
      status: d.status,
      paymentTerms: d.paymentTerms,
    },
  });

  after(async () => {
    const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
    const tpl = templateAdminCreatedDealer({
      name: d.name,
      companyName: d.companyName,
      email: d.email,
      password: d.password,
      loginUrl: `${base}/giris`,
    });
    queueEmail({ ...tpl, to: d.email });
  });

  return NextResponse.json(
    { id: user.id, dealerId: user.dealer?.id, message: "Bayi oluşturuldu." },
    { status: 201 },
  );
}
