import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { addressUpdateSchema, flattenZodError } from "@/lib/validations";
import { isValidLocation } from "@/lib/turkey-locations";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.address.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Adres bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = addressUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // PATCH'de city ya da district tek başına gelirse mevcut kayıtla merge edip
  // listeye uyumu doğrula — partial schema bunu tek alanla yakalayamaz.
  const mergedCity = data.city ?? existing.city;
  const mergedDistrict = data.district ?? existing.district;
  if (
    (data.city !== undefined || data.district !== undefined) &&
    !isValidLocation(mergedCity, mergedDistrict)
  ) {
    return NextResponse.json(
      { error: "Il/ilce listesi disinda bir deger." },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.address.updateMany({
        where: { userId: session.user.id, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.address.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.district !== undefined && { district: data.district }),
        ...(data.postalCode !== undefined && { postalCode: data.postalCode }),
        ...(data.addressLine !== undefined && { addressLine: data.addressLine }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });
  });

  logAudit({
    actorId: session.user.id,
    action: "ADDRESS_UPDATE",
    entityType: "user",
    entityId: session.user.id,
    metadata: { addressId: updated.id, fields: Object.keys(data) },
  });

  return NextResponse.json({ id: updated.id });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { id } = await context.params;
  const addr = await prisma.address.findUnique({ where: { id } });
  if (!addr || addr.userId !== session.user.id) {
    return NextResponse.json({ error: "Adres bulunamadi." }, { status: 404 });
  }

  // Orders reference addresses; don't hard-delete if any order uses this one —
  // the FK would block and the user would just see a cryptic 500.
  const orderCount = await prisma.order.count({ where: { addressId: id } });
  if (orderCount > 0) {
    return NextResponse.json(
      {
        error: `Bu adres ${orderCount} siparişde kullanildigi icin silinemez. Yerine yeni bir adres ekleyip varsayilan yapabilirsiniz.`,
      },
      { status: 409 }
    );
  }

  await prisma.address.delete({ where: { id } });

  logAudit({
    actorId: session.user.id,
    action: "ADDRESS_DELETE",
    entityType: "user",
    entityId: session.user.id,
    metadata: { addressId: id },
  });

  return NextResponse.json({ ok: true });
}
