import type { LedgerKind, Prisma, PrismaClient } from "@prisma/client";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface LedgerEntryInput {
  dealerId: string;
  kind: LedgerKind;
  /**
   * Signed delta applied to Dealer.currentBalance.
   *  +  dealer now owes more (order debit)
   *  -  dealer owes less (payment / cancellation credit)
   */
  amount: number;
  orderId?: string | null;
  reference?: string | null;
  note?: string | null;
  createdBy?: string | null;
  /**
   * When true, the balance update only succeeds while the dealer still has
   * room under creditLimit. Prevents concurrent OPEN_ACCOUNT orders from
   * collectively breaching the limit. Throws "CREDIT_LIMIT_EXCEEDED" if the
   * atomic check fails. Use for ORDER_DEBIT.
   */
  enforceCreditLimit?: boolean;
}

/**
 * Writes a ledger entry inside a transaction and returns the new balance.
 * The balance update is a single atomic UPDATE ... RETURNING so concurrent
 * writers can't clobber each other's deltas. With enforceCreditLimit, the
 * UPDATE's WHERE clause also guards the credit limit in the same statement.
 */
export async function writeLedgerEntry(
  tx: TxClient,
  input: LedgerEntryInput
): Promise<{ balanceAfter: number; entryId: string }> {
  const rows = input.enforceCreditLimit
    ? await tx.$queryRaw<Array<{ currentBalance: string | number }>>`
        UPDATE "dealers"
           SET "currentBalance" = "currentBalance" + ${input.amount}::numeric,
               "updatedAt" = NOW()
         WHERE "id" = ${input.dealerId}
           AND ("creditLimit" - "currentBalance") >= ${input.amount}::numeric
        RETURNING "currentBalance"
      `
    : await tx.$queryRaw<Array<{ currentBalance: string | number }>>`
        UPDATE "dealers"
           SET "currentBalance" = "currentBalance" + ${input.amount}::numeric,
               "updatedAt" = NOW()
         WHERE "id" = ${input.dealerId}
        RETURNING "currentBalance"
      `;

  if (rows.length === 0) {
    if (input.enforceCreditLimit) {
      // Could be missing dealer OR insufficient credit; disambiguate with a
      // lookup only on the cold path. Keeps the hot path a single round-trip.
      const exists = await tx.dealer.findUnique({
        where: { id: input.dealerId },
        select: { id: true },
      });
      if (!exists) throw new Error(`Dealer ${input.dealerId} not found`);
      throw new Error("CREDIT_LIMIT_EXCEEDED");
    }
    throw new Error(`Dealer ${input.dealerId} not found`);
  }

  const balanceAfter = Number(rows[0].currentBalance);

  const entry = await tx.dealerLedger.create({
    data: {
      dealerId: input.dealerId,
      kind: input.kind,
      amount: input.amount as unknown as Prisma.Decimal,
      balanceAfter: balanceAfter as unknown as Prisma.Decimal,
      orderId: input.orderId ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    },
  });

  return { balanceAfter, entryId: entry.id };
}
