import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { prisma } from "@/lib/prisma";

async function main() {
  const total = await prisma.product.count();
  const zero = await prisma.product.count({ where: { stockQuantity: 0 } });
  const one = await prisma.product.count({ where: { stockQuantity: 1 } });
  const between2_5 = await prisma.product.count({ where: { stockQuantity: { gte: 2, lte: 5 } } });
  const lt5 = await prisma.product.count({ where: { stockQuantity: { lt: 5, gt: 0 } } });
  const gte5 = await prisma.product.count({ where: { stockQuantity: { gte: 5 } } });
  const negative = await prisma.product.count({ where: { stockQuantity: { lt: 0 } } });
  const nullStock = await prisma.product.count({ where: { stockQuantity: null as unknown as number } }).catch(() => -1);

  console.log("Toplam urun        :", total);
  console.log("Stok = 0           :", zero, `(${((zero/total)*100).toFixed(1)}%)`);
  console.log("Stok = 1           :", one);
  console.log("Stok 2-5           :", between2_5);
  console.log("Stok 1-4 (1<=x<5)  :", lt5);
  console.log("Stok >= 5          :", gte5);
  console.log("Stok < 0           :", negative);
  if (nullStock !== -1) console.log("Stok NULL          :", nullStock);

  // Aggregate sum + max
  const agg = await prisma.product.aggregate({
    _sum: { stockQuantity: true },
    _max: { stockQuantity: true },
    _avg: { stockQuantity: true },
  });
  console.log("\nToplam stok adedi  :", agg._sum.stockQuantity);
  console.log("Max stok           :", agg._max.stockQuantity);
  console.log("Ortalama stok      :", Number(agg._avg.stockQuantity ?? 0).toFixed(1));
}

main().catch(console.error).finally(() => prisma.$disconnect());
