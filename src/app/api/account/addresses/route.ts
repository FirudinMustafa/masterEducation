import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { addressSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });
  return NextResponse.json({
    addresses: addresses.map((a) => ({
      id: a.id,
      label: a.label,
      fullName: a.fullName,
      phone: a.phone,
      city: a.city,
      district: a.district,
      postalCode: a.postalCode,
      addressLine: a.addressLine,
      isDefault: a.isDefault,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = addressSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.address.updateMany({
        where: { userId: session.user.id },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: {
        userId: session.user.id,
        label: data.label,
        fullName: data.fullName,
        phone: data.phone,
        city: data.city,
        district: data.district,
        postalCode: data.postalCode,
        addressLine: data.addressLine,
        isDefault: data.isDefault,
      },
    });
  });

  logAudit({
    actorId: session.user.id,
    action: "ADDRESS_CREATE",
    entityType: "user",
    entityId: session.user.id,
    metadata: { addressId: created.id, label: created.label },
  });

  return NextResponse.json({ id: created.id });
}
