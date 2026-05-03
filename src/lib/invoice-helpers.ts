import type { InvoiceOrder } from "@/components/invoice-view";
import { prisma } from "@/lib/prisma";

export async function loadInvoiceOrder(
  orderId: string,
  restrictUserId?: string
): Promise<InvoiceOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          dealer: {
            select: {
              companyName: true,
              taxOffice: true,
              taxNumber: true,
            },
          },
        },
      },
      items: true,
    },
  });
  if (!order) return null;
  if (restrictUserId && order.user.id !== restrictUserId) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discountTotal),
    vatTotal: Number(order.vatTotal),
    shippingCost: Number(order.shippingCost),
    total: Number(order.total),
    note: order.note,
    shippingName: order.shippingName,
    shippingAddress: order.shippingAddress,
    shippingCity: order.shippingCity,
    shippingPhone: order.shippingPhone,
    customerEmail: order.user.email,
    dealer: order.user.dealer
      ? {
          companyName: order.user.dealer.companyName,
          taxOffice: order.user.dealer.taxOffice,
          taxNumber: order.user.dealer.taxNumber,
        }
      : null,
    items: order.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      productSku: i.productSku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      discountPct: Number(i.discountPct),
      vatRate: Number(i.vatRate),
      vatAmount: Number(i.vatAmount),
      lineTotal: Number(i.lineTotal),
    })),
  };
}
