import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import {
  calculateDealerPrice,
  getDealerDiscountRules,
  pickBestRule,
} from "@/lib/pricing";

const schema = z.object({
  dealerId: z.string().min(1),
  productId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 },
    );
  }

  const { dealerId, productId } = parsed.data;

  const [product, rules] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        publisherId: true,
        categoryId: true,
        discountGroup: true,
        publisher: { select: { name: true } },
      },
    }),
    getDealerDiscountRules(dealerId),
  ]);

  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadi." }, { status: 404 });
  }

  const productInput = {
    id: product.id,
    price: Number(product.price),
    categoryId: product.categoryId,
    publisherId: product.publisherId,
    discountGroup: product.discountGroup,
  };

  const best = pickBestRule(productInput, rules);
  const pricing = calculateDealerPrice(productInput, rules);

  // Tüm uygulanabilir kurallari raporla — hangisi secildi, hangileri eldi?
  const allApplicable = rules
    .filter((r) => pickBestRule(productInput, [r]) !== null)
    .map((r) => ({
      scope: r.scope,
      discountPct: Number(r.discountPct),
      productId: r.productId,
      publisherId: r.publisherId,
      discountGroup: r.discountGroup,
      isWinner:
        r.scope === best?.scope &&
        r.productId === best?.productId &&
        r.publisherId === best?.publisherId &&
        r.discountGroup === best?.discountGroup,
    }));

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      publisherName: product.publisher?.name ?? null,
      discountGroup: product.discountGroup,
    },
    listPrice: pricing.listPrice,
    dealerPrice: pricing.dealerPrice,
    discountPct: pricing.discountPct,
    matchedScope: pricing.matchedScope,
    applicableRules: allApplicable,
  });
}
