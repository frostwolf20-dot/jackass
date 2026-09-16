const MONEY_PATTERN = /[^0-9.,()\-+]/g;

export function parseMoneyToMinorUnits(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }

  const original = String(value).trim();
  if (!original) return null;

  const upper = original.toUpperCase();
  const isDebitMarker = /\bDR\b/.test(upper);
  const isCreditMarker = /\bCR\b/.test(upper);
  let cleaned = original.replace(MONEY_PATTERN, "").replace(/,/g, "").trim();
  if (!cleaned) return null;

  let negative = false;
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(minor)) return null;

  if (isDebitMarker && !isCreditMarker) negative = true;
  if (isCreditMarker && !isDebitMarker) negative = false;
  return negative ? -minor : minor;
}

export function formatMinorUnits(value, currency = "GBP") {
  if (!Number.isSafeInteger(value)) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

function addIssue(issues, issue) {
  issues.push({ severity: "error", ...issue });
}

function parseOptionalAmount(value, field, issues, rowNumber) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = parseMoneyToMinorUnits(value);
  if (parsed === null) {
    addIssue(issues, {
      type: "unparseable_amount",
      rowNumber,
      field,
      actualValue: String(value)
    });
    return 0;
  }
  return Math.abs(parsed);
}

export function reconcileStatement(input) {
  const issues = [];
  const currency = String(input?.currency || "GBP").toUpperCase();
  const openingBalance = parseMoneyToMinorUnits(input?.openingBalance);
  const statementClosingBalance = parseMoneyToMinorUnits(input?.closingBalance);
  const transactions = Array.isArray(input?.transactions) ? input.transactions : [];

  if (openingBalance === null) {
    addIssue(issues, { type: "missing_opening_balance" });
  }
  if (statementClosingBalance === null) {
    addIssue(issues, { type: "missing_closing_balance" });
  }
  if (!transactions.length) {
    addIssue(issues, { type: "no_transactions" });
  }

  let currentBalance = openingBalance ?? 0;
  let totalCredits = 0;
  let totalDebits = 0;
  let runningBalanceChecks = 0;
  let runningBalanceFailures = 0;

  const transactionResults = transactions.map((transaction, index) => {
    const rowNumber = Number(transaction?.rowNumber ?? index + 1);
    const debit = parseOptionalAmount(transaction?.debit, "debit", issues, rowNumber);
    const credit = parseOptionalAmount(transaction?.credit, "credit", issues, rowNumber);

    if (debit > 0 && credit > 0) {
      addIssue(issues, {
        type: "both_debit_and_credit",
        rowNumber,
        debit,
        credit
      });
    }

    totalDebits += debit;
    totalCredits += credit;
    currentBalance = currentBalance + credit - debit;

    let runningBalanceStatus = "not_available";
    let statementBalance = null;
    let difference = null;

    if (transaction?.balance !== null && transaction?.balance !== undefined && transaction?.balance !== "") {
      statementBalance = parseMoneyToMinorUnits(transaction.balance);
      if (statementBalance === null) {
        addIssue(issues, {
          type: "unparseable_running_balance",
          rowNumber,
          actualValue: String(transaction.balance)
        });
        runningBalanceStatus = "invalid";
      } else {
        runningBalanceChecks += 1;
        difference = statementBalance - currentBalance;
        if (difference === 0) {
          runningBalanceStatus = "passed";
        } else {
          runningBalanceFailures += 1;
          runningBalanceStatus = "failed";
          addIssue(issues, {
            type: "running_balance_mismatch",
            rowNumber,
            expectedValue: currentBalance,
            actualValue: statementBalance,
            difference
          });
        }
      }
    }

    return {
      rowNumber,
      date: transaction?.date ?? null,
      description: transaction?.description ?? "",
      page: transaction?.page ?? null,
      debit,
      credit,
      expectedBalance: currentBalance,
      statementBalance,
      runningBalanceStatus,
      difference
    };
  });

  const calculatedClosingBalance = openingBalance === null ? null : openingBalance + totalCredits - totalDebits;
  const closingDifference = calculatedClosingBalance === null || statementClosingBalance === null
    ? null
    : statementClosingBalance - calculatedClosingBalance;

  if (closingDifference !== null && closingDifference !== 0) {
    addIssue(issues, {
      type: "closing_balance_mismatch",
      expectedValue: calculatedClosingBalance,
      actualValue: statementClosingBalance,
      difference: closingDifference
    });
  }

  let pageChecks = 0;
  let failedPageChecks = 0;
  const pageBalances = Array.isArray(input?.pageBalances) ? input.pageBalances : [];
  for (let index = 1; index < pageBalances.length; index += 1) {
    const previousClosing = parseMoneyToMinorUnits(pageBalances[index - 1]?.closingBalance);
    const currentOpening = parseMoneyToMinorUnits(pageBalances[index]?.openingBalance);
    if (previousClosing === null || currentOpening === null) continue;
    pageChecks += 1;
    if (previousClosing !== currentOpening) {
      failedPageChecks += 1;
      addIssue(issues, {
        type: "page_continuity_mismatch",
        page: pageBalances[index]?.page ?? index + 1,
        expectedValue: previousClosing,
        actualValue: currentOpening,
        difference: currentOpening - previousClosing
      });
    }
  }

  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const hasCoreBalances = openingBalance !== null && statementClosingBalance !== null;
  const totalsPass = closingDifference === 0;

  let status = "review_required";
  if (hasCoreBalances && totalsPass && blockingIssues.length === 0) {
    status = "reconciled";
  } else if (hasCoreBalances && (closingDifference !== 0 || runningBalanceFailures > 0 || failedPageChecks > 0)) {
    status = "failed";
  }

  const verificationLevel = runningBalanceChecks === transactions.length && transactions.length > 0
    ? "full_running_balance"
    : runningBalanceChecks > 0
      ? "partial_running_balance"
      : "statement_total";

  return {
    status,
    verificationLevel,
    currency,
    openingBalance,
    totalCredits,
    totalDebits,
    calculatedClosingBalance,
    statementClosingBalance,
    closingDifference,
    transactionCount: transactions.length,
    runningBalanceChecks,
    runningBalanceFailures,
    pageChecks,
    failedPageChecks,
    issues,
    transactionResults
  };
}
