import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const email = process.argv[2];
if (!email) {
  console.error("Kullanim: npx tsx scripts/check-dealer-delete-blockers.ts <email>");
  process.exit(1);
}

(async () => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      dealer: {
        include: {
          _count: { select: { ledger: true, documents: true, discountRules: true } },
        },
      },
      orders: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          paymentStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    console.log("User bulunamadi:", email);
    process.exit(0);
  }

  console.log("─── USER ───");
  console.log("id:        ", user.id);
  console.log("email:     ", user.email);
  console.log("name:      ", user.name);
  console.log("role:      ", user.role);
  console.log("createdAt: ", user.createdAt.toISOString());

  if (!user.dealer) {
    console.log("\n  Bu user'in DEALER kaydi yok — zaten silinmis veya hic olmamis.");
    process.exit(0);
  }

  const d = user.dealer;
  console.log("\n─── DEALER ───");
  console.log("id:             ", d.id);
  console.log("companyName:    ", d.companyName);
  console.log("status:         ", d.status);
  console.log("paymentTerms:   ", d.paymentTerms);
  console.log("creditLimit:    ", String(d.creditLimit));
  console.log("currentBalance: ", String(d.currentBalance));
  console.log("ledger entries: ", d._count.ledger);
  console.log("documents:      ", d._count.documents);
  console.log("discount rules: ", d._count.discountRules);
  console.log("kolaybiContact: ", d.kolaybiContactId);

  console.log("\n─── ORDERS (toplam: " + user.orders.length + ") ───");
  if (user.orders.length === 0) {
    console.log("  (yok)");
  } else {
    for (const o of user.orders) {
      console.log(
        `  ${o.orderNumber.padEnd(20)} status=${o.status.padEnd(10)} pay=${o.paymentStatus.padEnd(8)} total=${String(o.total).padStart(10)}  ${o.createdAt.toISOString().slice(0, 10)}`
      );
    }
  }

  const activeStatuses = ["PENDING", "APPROVED", "PROCESSING", "SHIPPED"];
  const activeOrders = user.orders.filter((o) => activeStatuses.includes(o.status));

  console.log("\n─── SILME ENGEL ANALIZI ───");
  let blocked = false;
  if (activeOrders.length > 0) {
    blocked = true;
    console.log(`  ❌ ${activeOrders.length} aktif (kapanmamis) siparis var:`);
    for (const o of activeOrders) {
      console.log(`     - ${o.orderNumber} (${o.status})`);
    }
    console.log("     → Bunlari DELIVERED veya CANCELLED yapmak gerekiyor.");
  }
  if (Number(d.currentBalance) !== 0) {
    blocked = true;
    console.log(`  ❌ Cari bakiye ${Number(d.currentBalance).toFixed(2)} TL (sifir degil).`);
    console.log("     → Once bakiyeyi sifirlayin (odeme veya manuel duzenleme).");
  }
  if (!blocked) {
    console.log("  ✅ Hicbir engel yok, silinmesi gerekirdi. Kod tarafinda baska bir hata olabilir.");
  }

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
