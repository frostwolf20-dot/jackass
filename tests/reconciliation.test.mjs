import test from "node:test";
import assert from "node:assert/strict";
import { parseMoneyToMinorUnits, reconcileStatement } from "../lib/reconciliation.mjs";

test("parses common money formats into exact minor units", () => {
  assert.equal(parseMoneyToMinorUnits("£1,250.32"), 125032);
  assert.equal(parseMoneyToMinorUnits("1,250.32 DR"), -125032);
  assert.equal(parseMoneyToMinorUnits("1,250.32 CR"), 125032);
  assert.equal(parseMoneyToMinorUnits("(45.50)"), -4550);
  assert.equal(parseMoneyToMinorUnits("-0.01"), -1);
  assert.equal(parseMoneyToMinorUnits("n/a"), null);
});

test("reconciles a fully consistent statement", () => {
  const result = reconcileStatement({
    currency: "GBP",
    openingBalance: "1000.00",
    closingBalance: "2439.01",
    transactions: [
      { rowNumber: 1, debit: "45.00", balance: "955.00" },
      { rowNumber: 2, credit: "2000.00", balance: "2955.00" },
      { rowNumber: 3, debit: "15.99", balance: "2939.01" },
      { rowNumber: 4, debit: "500.00", balance: "2439.01" }
    ]
  });

  assert.equal(result.status, "reconciled");
  assert.equal(result.verificationLevel, "full_running_balance");
  assert.equal(result.closingDifference, 0);
  assert.equal(result.runningBalanceChecks, 4);
  assert.equal(result.runningBalanceFailures, 0);
  assert.equal(result.issues.length, 0);
});

test("fails when the closing balance does not agree", () => {
  const result = reconcileStatement({
    openingBalance: "1000.00",
    closingBalance: "900.00",
    transactions: [{ debit: "50.00", balance: "950.00" }]
  });

  assert.equal(result.status, "failed");
  assert.equal(result.closingDifference, -5000);
  assert.ok(result.issues.some((issue) => issue.type === "closing_balance_mismatch"));
});

test("identifies the exact row with a running balance mismatch", () => {
  const result = reconcileStatement({
    openingBalance: "1000.00",
    closingBalance: "950.00",
    transactions: [{ rowNumber: 7, debit: "50.00", balance: "960.00" }]
  });

  assert.equal(result.status, "failed");
  const issue = result.issues.find((entry) => entry.type === "running_balance_mismatch");
  assert.equal(issue?.rowNumber, 7);
  assert.equal(issue?.difference, 1000);
});

test("requires review instead of pretending when opening balance is missing", () => {
  const result = reconcileStatement({
    openingBalance: null,
    closingBalance: "950.00",
    transactions: [{ debit: "50.00", balance: "950.00" }]
  });

  assert.equal(result.status, "review_required");
  assert.ok(result.issues.some((issue) => issue.type === "missing_opening_balance"));
});

test("checks page-to-page continuity when page balances are provided", () => {
  const result = reconcileStatement({
    openingBalance: "1000.00",
    closingBalance: "1000.00",
    transactions: [],
    pageBalances: [
      { page: 1, openingBalance: "1000.00", closingBalance: "900.00" },
      { page: 2, openingBalance: "850.00", closingBalance: "1000.00" }
    ]
  });

  assert.equal(result.pageChecks, 1);
  assert.equal(result.failedPageChecks, 1);
  assert.ok(result.issues.some((issue) => issue.type === "page_continuity_mismatch"));
});
