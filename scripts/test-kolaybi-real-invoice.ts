/**
 * KolayBi GERÇEK sandbox fatura testi (tek seferlik).
 *
 * Mock DEĞİL — gerçek sandbox'a contact + product + invoice POST eder.
 * Sipariş DELIVERED akışını birebir taklit eder: ensureInvoiceForOrder +
 * sendPendingInvoice. Sonunda DB fixture'larını temizler; KolayBi sandbox
 * kayıtları panelde doğrulama için KALIR.
 *
 * Kullanım (sandbox env inline):
 *   KOLAYBI_BASE_URL=https://ofis-sandbox-api.kolaybi.com \
 *   KOLAYBI_API_KEY=... KOLAYBI_CHANNEL=mastereltegitim \
 *   npx tsx scripts/test-kolaybi-real-invoice.ts
 */
import "dotenv/config"; // .env (DATABASE_URL, NEXTAUTH_SECRET) — KolayBi env'leri inline geçilir
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

import * as kolaybi from "@/lib/adapters/kolaybi";
import {
  ensureInvoiceForOrder,
  sendPendingInvoice,
} from "@/lib/invoice-service";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ts = Date.now();
const cleanup = { userIds: [] as string[], orderIds: [] as string[], productIds: [] as string[] };

(async () => {
  try {
    console.log("─── KolayBi GERÇEK sandbox fatura testi ───");
    console.log(`  Base: ${process.env.KOLAYBI_BASE_URL ?? "(default sandbox)"}`);
    console.log(`  Channel: ${process.env.KOLAYBI_CHANNEL}`);
    console.log(`  isOperational=${kolaybi.isOperational()}`);
    if (!kolaybi.isConfigured()) {
      console.log("\n  ⚠️ KolayBi yapılandırılmamış (key/channel yok).");
      process.exitCode = 1;
      return;
    }

    // ─── Fixtures: test bayisi + adres + ürün ───
    const dealerUser = await prisma.user.create({
      data: {
        email: `kbis-real-dealer-${ts}@test.com`,
        name: "Sandbox Test Bayi Sahibi",
        passwordHash: await bcrypt.hash("x", 10),
        role: "DEALER",
        emailVerified: new Date(),
        phone: "5551112233",
        dealer: {
          create: {
            companyName: `Sandbox Test Bayi ${ts}`,
            taxOffice: "Kadıköy",
            taxNumber: "1234567890", // 10 hane → kurumsal
            status: "APPROVED",
            paymentTerms: "OPEN_ACCOUNT",
            creditLimit: 50000,
          },
        },
        addresses: {
          create: {
            label: "Fatura",
            fullName: "Sandbox Test Bayi",
            phone: "5551112233",
            city: "İstanbul",
            district: "Kadıköy",
            postalCode: "34710",
            addressLine: "Test Caddesi No 5",
            isDefault: true,
          },
        },
      },
      include: { dealer: true, addresses: true },
    });
    cleanup.userIds.push(dealerUser.id);
    console.log(`\n  ✓ Test bayisi oluşturuldu: ${dealerUser.dealer!.companyName}`);

    const product = await prisma.product.create({
      data: {
        name: `Sandbox Test Kitabı ${ts}`,
        slug: `kbis-real-${ts}`,
        sku: `KBIS-REAL-${ts}`,
        nopId: 991000 + (ts % 1000),
        price: 150,
        vatRate: 10,
        stockQuantity: 100,
        isPublished: true,
      },
    });
    cleanup.productIds.push(product.id);
    console.log(`  ✓ Test ürünü oluşturuldu: ${product.name}`);

    const order = await prisma.order.create({
      data: {
        orderNumber: `KBIS-REAL-${ts}`,
        user: { connect: { id: dealerUser.id } },
        address: { connect: { id: dealerUser.addresses[0].id } },
        status: "DELIVERED",
        paymentMethod: "OPEN_ACCOUNT",
        paymentStatus: "PAID",
        subtotal: 300,
        discountTotal: 0,
        shippingCost: 0,
        vatTotal: 27.27,
        total: 300,
        shippingName: "Sandbox Test",
        shippingPhone: "5551112233",
        shippingCity: "İstanbul",
        shippingAddress: "Test Caddesi No 5",
        items: {
          create: [
            {
              productId: product.id,
              productName: product.name,
              productSku: product.sku,
              quantity: 2,
              unitPrice: 150,
              discountPct: 0,
              vatRate: 10,
              vatAmount: 27.27,
              lineTotal: 300,
            },
          ],
        },
      },
    });
    cleanup.orderIds.push(order.id);
    console.log(`  ✓ DELIVERED sipariş oluşturuldu: ${order.orderNumber} (2 x 150 = 300 TL)`);

    // ─── Fatura akışı (status route'un yaptığının aynısı) ───
    console.log("\n  → ensureInvoiceForOrder...");
    const r = await ensureInvoiceForOrder(order.id);
    console.log(`    invoice kaydı: created=${r.created} id=${r.invoiceId}`);

    console.log("  → sendPendingInvoice (GERÇEK KolayBi POST)...");
    const send = await sendPendingInvoice(r.invoiceId);
    console.log(`    sonuç: status=${send.status}${send.reason ? ` reason=${send.reason}` : ""}`);

    const inv = await prisma.invoice.findUnique({ where: { id: r.invoiceId } });
    console.log("\n─── SONUÇ ───");
    console.log(`  DB invoice.status   : ${inv?.status}`);
    console.log(`  KolayBi document_id : ${inv?.externalId ?? "(yok)"}`);
    console.log(`  syncedAt            : ${inv?.syncedAt?.toISOString() ?? "(yok)"}`);
    if (inv?.errorMessage) console.log(`  errorMessage        : ${inv.errorMessage}`);

    // Bayinin KolayBi contact/address ID'leri
    const dealerAfter = await prisma.dealer.findUnique({ where: { id: dealerUser.dealer!.id } });
    console.log(`  KolayBi contact_id  : ${dealerAfter?.kolaybiContactId ?? "(yok)"}`);
    console.log(`  KolayBi address_id  : ${dealerAfter?.kolaybiAddressId ?? "(yok)"}`);
    const prodAfter = await prisma.product.findUnique({ where: { id: product.id } });
    console.log(`  KolayBi product_id  : ${prodAfter?.kolaybiProductId ?? "(yok)"}`);

    if (inv?.status === "SENT" && inv.externalId) {
      console.log(`\n  ✅ Fatura KolayBi sandbox'a oluşturuldu. Panelde document_id=${inv.externalId} ile ara.`);
      console.log(`     Panel: https://ofis-sandbox.kolaybi.com/app/login (mastereltegitim@kolaybi.com)`);
    } else {
      console.log("\n  ✗ Fatura oluşturulamadı — yukarıdaki errorMessage'a bak.");
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("\nFATAL:", err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  } finally {
    // DB fixture cleanup (KolayBi sandbox kayıtları KALIR — panel doğrulaması için)
    console.log("\n[DB cleanup — sandbox kayıtları kalır]");
    for (const id of cleanup.orderIds) {
      await prisma.invoice.deleteMany({ where: { orderId: id } }).catch(() => {});
      await prisma.orderEvent.deleteMany({ where: { orderId: id } }).catch(() => {});
      await prisma.orderItem.deleteMany({ where: { orderId: id } }).catch(() => {});
      await prisma.paymentSession.deleteMany({ where: { orderId: id } }).catch(() => {});
      await prisma.order.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanup.productIds) {
      await prisma.product.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanup.userIds) {
      await prisma.address.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.dealer.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { actorId: id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id } }).catch(() => {});
    }
    console.log("  ✓ temizlendi");
    await prisma.$disconnect();
    await pool.end();
  }
})();
