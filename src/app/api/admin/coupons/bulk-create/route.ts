import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const MAX_COUNT = 500;

const bodySchema = z.object({
  // Pattern içerebilecekler: {N} sıralı sayı (1, 2, 3...), {NNN} 3-haneli (001, 002...).
  // Geriye dönük: codeTemplate'in {N} ya da {NNN} içermezse otomatik suffix eklenir.
  codeTemplate: z
    .string()
    .min(2)
    .max(40)
    .transform((v) => v.trim().toUpperCase()),
  startNumber: z.number().int().min(0).max(1_000_000).optional().default(1),
  count: z.number().int().min(1).max(MAX_COUNT),
  kind: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  value: z.number().min(0).max(999_999),
  minSubtotal: z.number().min(0).max(999_999).default(0),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
  dryRun: z.boolean().optional().default(false),
});

function expandCode(template: string, n: number, padded: number): string {
  // {NNN} → padded with leading zeros to 3 chars; {N} → no padding
  if (template.includes("{NNN}")) {
    return template.replace(/\{NNN\}/g, String(n).padStart(padded, "0"));
  }
  if (template.includes("{N}")) {
    return template.replace(/\{N\}/g, String(n));
  }
  // Pattern yoksa otomatik suffix ekle: SUMMER → SUMMER-001
  return `${template}-${String(n).padStart(padded, "0")}`;
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const {
    codeTemplate,
    startNumber,
    count,
    kind,
    value,
    minSubtotal,
    maxUses,
    validFrom,
    validUntil,
    isActive,
    dryRun,
  } = parsed.data;

  // Padding genişliği: count ne kadar büyükse o kadar geniş.
  const pad = Math.max(3, String(startNumber + count - 1).length);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(expandCode(codeTemplate, startNumber + i, pad));
  }

  // Çakışma kontrolü
  const existing = await prisma.coupon.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  const conflictSet = new Set(existing.map((c) => c.code));
  const newCodes = codes.filter((c) => !conflictSet.has(c));

  if (dryRun) {
    return NextResponse.json({
      total: count,
      willCreate: newCodes.length,
      conflicts: codes.filter((c) => conflictSet.has(c)).slice(0, 50),
      sample: newCodes.slice(0, 20),
      applied: false,
    });
  }

  if (newCodes.length === 0) {
    return NextResponse.json(
      {
        error: "Tüm üretilen kodlar zaten mevcut — pattern'i veya startNumber'ı değiştirin.",
        conflicts: codes.slice(0, 20),
      },
      { status: 409 }
    );
  }

  const result = await prisma.coupon.createMany({
    data: newCodes.map((code) => ({
      code,
      kind,
      value,
      minSubtotal,
      maxUses: maxUses ?? null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
      isActive,
    })),
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "COUPON_BULK_CREATE",
    entityType: "coupon",
    entityId: "bulk",
    metadata: {
      template: codeTemplate,
      count: result.count,
      requested: count,
      conflicts: codes.length - newCodes.length,
      kind,
      value,
      validUntil,
      sample: newCodes.slice(0, 5),
    },
  });

  return NextResponse.json({
    created: result.count,
    conflicts: codes.length - newCodes.length,
    sample: newCodes.slice(0, 20),
    applied: true,
  });
}
