import { TX_CONFIRMED_THRESHOLD } from "@/lib/config/config";
import type { Transaction, TransactionType } from "@/lib/types";
import { isUiMessageOut, resolveUiTransactionType } from "@/lib/ui/transaction-kind";
import { CCX_PRECISION_DECIMAL_DISPLAY, ccxToNumber } from "@/lib/utils";

/** Column order for the exported CSV. Single source for header + row shape. */
export const CSV_COLUMNS = [
  "Date",
  "Type",
  "Direction",
  "Amount (CCX)",
  "Amount (atomic)",
  "Address",
  "Payment ID",
  "Hash",
  "Block Height",
  "Confirmations",
  "Status",
  "Message",
] as const;

// Generated numeric columns are trusted (not attacker-controlled) and must NOT be
// formula-guarded, or a legitimate negative amount ("-50") would gain a stray "'".
const TRUSTED_HEADERS = new Set<string>([
  "Amount (CCX)",
  "Amount (atomic)",
  "Block Height",
  "Confirmations",
]);
const TRUSTED_INDICES = new Set(
  CSV_COLUMNS.flatMap((header, index) => (TRUSTED_HEADERS.has(header) ? [index] : [])),
);

// Display labels mirror `transactionMeta` in the transactions page.
const TYPE_LABELS: Record<TransactionType, string> = {
  receive: "Receive",
  send: "Send",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  fusion: "Fusion",
  miner: "Miner",
  message: "Message",
};

// Types whose amount is an outflow (negative). Mirrors transactionMeta `sign: "−"`;
// message direction is derived per-row via isUiMessageOut.
const OUTGOING_TYPES = new Set<TransactionType>(["send", "fusion"]);

// OWASP CSV/formula-injection guard (CWE-1236). A cell a spreadsheet could evaluate
// as a formula (leading = + - @, or whitespace then those) is prefixed with a single
// quote. This regex is the entire safety boundary — keep it broad.
const FORMULA_TRIGGER = /^[=+\-@\t\r\n]/;
const SPACE_THEN_FORMULA = /^\s+[=+\-@]/;
const CSV_EOL = "\r\n";

function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGER.test(value) || SPACE_THEN_FORMULA.test(value) ? `'${value}` : value;
}

/** RFC 4180 field — optional formula-guard, then quote when needed (doubling quotes). */
function csvField(value: string, trusted: boolean): string {
  const safe = trusted ? value : neutralizeFormula(value);
  const needsQuotes = /[",\r\n]/.test(safe) || /^\s|\s$/.test(safe);
  return needsQuotes ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function isOutgoing(transaction: Transaction, type: TransactionType): boolean {
  return OUTGOING_TYPES.has(type) || (type === "message" && isUiMessageOut(transaction));
}

function transactionRow(transaction: Transaction): string[] {
  const type = resolveUiTransactionType(transaction);
  const sign = isOutgoing(transaction, type) ? "-" : "";
  return [
    new Date(transaction.timestamp).toISOString(),
    TYPE_LABELS[type],
    isOutgoing(transaction, type) ? "Outgoing" : "Incoming",
    `${sign}${Math.abs(ccxToNumber(transaction.amount)).toFixed(CCX_PRECISION_DECIMAL_DISPLAY)}`,
    `${sign}${Math.abs(transaction.amount.atomic)}`,
    transaction.address ?? "",
    transaction.paymentId ?? "",
    transaction.hash ?? "",
    String(transaction.blockHeight),
    String(transaction.confirmations),
    transaction.confirmations >= TX_CONFIRMED_THRESHOLD ? "Confirmed" : "Pending",
    transaction.message ?? "",
  ];
}

function serializeRow(cells: readonly string[], allTrusted: boolean): string {
  return cells
    .map((cell, index) => csvField(cell, allTrusted || TRUSTED_INDICES.has(index)))
    .join(",");
}

/**
 * Serialize transactions to an RFC 4180 CSV string (no BOM, no DOM — the download
 * helper adds the BOM). Empty input yields the header row only.
 */
export function transactionsToCsv(transactions: readonly Transaction[]): string {
  const header = serializeRow(CSV_COLUMNS, true);
  const body = transactions.map((transaction) => serializeRow(transactionRow(transaction), false));
  return [header, ...body].join(CSV_EOL) + CSV_EOL;
}
