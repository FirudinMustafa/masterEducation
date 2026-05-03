import "dotenv/config";
import { calculateDealerPrice, getDealerDiscountRules } from "../src/lib/pricing";
import { prisma } from "../src/lib/prisma";

async function main() {
  const u = await prisma.user.findUnique({
    where: { email: "cankadak@gmail.com" },
    include: { dealer: true },
  });
  console.log("Dealer:", u?.dealer?.id, "|", u?.dealer?.companyName);
  if (!u?.dealer) return;

  const rules = await getDealerDiscountRules(u.dealer.id);
  console.log("Rules:", JSON.stringify(rules, null, 2));

  const p = await prisma.product.findFirst({
    where: { isPublished: true, price: { gt: 0 } },
    select: {
      id: true,
      name: true,
      price: true,
      categoryId: true,
      publisherId: true,
      discountGroup: true,
    },
  });
  if (!p) return;

  console.log("\nProduct:", p.name, "| listPrice:", Number(p.price));
  console.log("  categoryId:", p.categoryId, "publisherId:", p.publisherId, "group:", p.discountGroup);

  const pricing = calculateDealerPrice(
    {
      id: p.id,
      price: Number(p.price),
      categoryId: p.categoryId,
      publisherId: p.publisherId,
      discountGroup: p.discountGroup,
    },
    rules,
  );
  console.log("\nPricing:", JSON.stringify(pricing, null, 2));
  console.log("Expected dealerPrice: 0 (GLOBAL %100)");
}

main().finally(() => process.exit(0));
