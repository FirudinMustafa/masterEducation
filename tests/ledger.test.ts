import { describe, expect, it, vi } from "vitest";
import { writeLedgerEntry } from "@/lib/ledger";

/**
 * Mocks a tx client where the dealer's row is a single number. $queryRaw
 * simulates Postgres: when the SQL's WHERE clause references "creditLimit"
 * (i.e. enforceCreditLimit was on), we enforce the limit here; otherwise the
 * UPDATE always succeeds if the dealer exists.
 */
function mockTx(opts: {
  initialBalance: number;
  creditLimit?: number;
  dealerExists?: boolean;
}) {
  let balance = opts.initialBalance;
  const creditLimit = opts.creditLimit ?? Number.POSITIVE_INFINITY;
  const dealerExists = opts.dealerExists ?? true;

  const queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (!dealerExists) return [] as Array<{ currentBalance: number }>;
      const sqlJoined = strings.join("?");
      const enforce = sqlJoined.includes("creditLimit");
      const amount = Number(values[0]);
      if (enforce) {
        const available = creditLimit - balance;
        if (available < amount) return [];
      }
      balance = Math.round((balance + amount) * 100) / 100;
      return [{ currentBalance: balance }];
    },
  );

  const ledgerCreate = vi.fn(async ({ data }: { data: unknown }) => ({
    id: "entry-id",
    ...(data as object),
  }));

  const dealerFindUnique = vi.fn(async () =>
    dealerExists ? { id: "d1" } : null,
  );

  return {
    $queryRaw: queryRaw,
    dealer: { findUnique: dealerFindUnique },
    dealerLedger: { create: ledgerCreate },
    _spies: { queryRaw, ledgerCreate, dealerFindUnique },
    _balance: () => balance,
  } as unknown as Parameters<typeof writeLedgerEntry>[0] & {
    _spies: {
      queryRaw: ReturnType<typeof vi.fn>;
      ledgerCreate: ReturnType<typeof vi.fn>;
      dealerFindUnique: ReturnType<typeof vi.fn>;
    };
    _balance: () => number;
  };
}

describe("dealer ledger", () => {
  it("debits increase balance and credits decrease it", async () => {
    const tx = mockTx({ initialBalance: 500 });
    const out = await writeLedgerEntry(tx, {
      dealerId: "d1",
      kind: "ORDER_DEBIT",
      amount: 250,
    });
    expect(out.balanceAfter).toBe(750);

    const tx2 = mockTx({ initialBalance: 750 });
    const out2 = await writeLedgerEntry(tx2, {
      dealerId: "d1",
      kind: "PAYMENT_CREDIT",
      amount: -300,
    });
    expect(out2.balanceAfter).toBe(450);
  });

  it("rounds balance to 2 decimals", async () => {
    const tx = mockTx({ initialBalance: 99.999 });
    const out = await writeLedgerEntry(tx, {
      dealerId: "d1",
      kind: "ORDER_DEBIT",
      amount: 0.001,
    });
    expect(out.balanceAfter).toBe(100);
  });

  it("throws when dealer not found (no enforcement)", async () => {
    const tx = mockTx({ initialBalance: 0, dealerExists: false });
    await expect(
      writeLedgerEntry(tx, {
        dealerId: "missing",
        kind: "ORDER_DEBIT",
        amount: 100,
      }),
    ).rejects.toThrow(/not found/);
  });

  it("writes ledger entry after the atomic balance update", async () => {
    const tx = mockTx({ initialBalance: 1000 });
    await writeLedgerEntry(tx, {
      dealerId: "d1",
      kind: "ORDER_DEBIT",
      amount: 50,
      orderId: "o1",
      note: "test",
    });
    const call = tx._spies.ledgerCreate.mock.calls[0][0].data;
    expect(call.balanceAfter).toBe(1050);
    expect(call.amount).toBe(50);
    expect(call.orderId).toBe("o1");
    expect(call.note).toBe("test");
  });
});

describe("dealer ledger — credit limit enforcement", () => {
  it("allows ORDER_DEBIT when within credit limit", async () => {
    const tx = mockTx({ initialBalance: 500, creditLimit: 1000 });
    const out = await writeLedgerEntry(tx, {
      dealerId: "d1",
      kind: "ORDER_DEBIT",
      amount: 400, // 500 + 400 = 900 <= 1000 ✓
      enforceCreditLimit: true,
    });
    expect(out.balanceAfter).toBe(900);
  });

  it("allows ORDER_DEBIT exactly at the credit limit", async () => {
    const tx = mockTx({ initialBalance: 500, creditLimit: 1000 });
    const out = await writeLedgerEntry(tx, {
      dealerId: "d1",
      kind: "ORDER_DEBIT",
      amount: 500, // 500 + 500 = 1000 == 1000 ✓
      enforceCreditLimit: true,
    });
    expect(out.balanceAfter).toBe(1000);
  });

  it("throws CREDIT_LIMIT_EXCEEDED when over limit", async () => {
    const tx = mockTx({ initialBalance: 800, creditLimit: 1000 });
    await expect(
      writeLedgerEntry(tx, {
        dealerId: "d1",
        kind: "ORDER_DEBIT",
        amount: 300, // 800 + 300 = 1100 > 1000 ✗
        enforceCreditLimit: true,
      }),
    ).rejects.toThrow(/CREDIT_LIMIT_EXCEEDED/);
  });

  it("does not write a ledger entry when credit limit blocks", async () => {
    const tx = mockTx({ initialBalance: 800, creditLimit: 1000 });
    await expect(
      writeLedgerEntry(tx, {
        dealerId: "d1",
        kind: "ORDER_DEBIT",
        amount: 300,
        enforceCreditLimit: true,
      }),
    ).rejects.toThrow();
    expect(tx._spies.ledgerCreate).not.toHaveBeenCalled();
  });

  it("negative amounts bypass the limit (credits always allowed)", async () => {
    // Credit of -500 on a balance at the limit should succeed.
    const tx = mockTx({ initialBalance: 1000, creditLimit: 1000 });
    const out = await writeLedgerEntry(tx, {
      dealerId: "d1",
      kind: "ORDER_CANCEL_CREDIT",
      amount: -500,
      enforceCreditLimit: true,
    });
    expect(out.balanceAfter).toBe(500);
  });

  it("distinguishes missing dealer from limit breach in enforce mode", async () => {
    const tx = mockTx({ initialBalance: 0, dealerExists: false });
    await expect(
      writeLedgerEntry(tx, {
        dealerId: "ghost",
        kind: "ORDER_DEBIT",
        amount: 100,
        enforceCreditLimit: true,
      }),
    ).rejects.toThrow(/not found/);
  });
});
