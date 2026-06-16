import { describe, expect, it } from "vitest";
import type { Transaction } from "@/lib/types";
import { CSV_COLUMNS, transactionsToCsv } from "@/lib/ui/transaction-csv";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    hash: "abc123",
    type: "receive",
    amount: { atomic: 50_000_000 }, // 50 CCX
    address: "ccx7aaa",
    timestamp: "2026-05-01T00:00:00.000Z",
    blockHeight: 100,
    confirmations: 12,
    ...overrides,
  };
}

/** Minimal RFC-4180 row parser (handles quotes + doubled quotes) for assertions. */
function parseRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function rows(csv: string): string[][] {
  return csv
    .replace(/\r\n$/, "")
    .split("\r\n")
    .map(parseRow);
}

const COL = Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, i])) as Record<string, number>;

describe("transactionsToCsv — structure", () => {
  it("empty input yields header row only, CRLF-terminated", () => {
    const csv = transactionsToCsv([]);
    expect(csv).toBe(`${CSV_COLUMNS.join(",")}\r\n`);
  });

  it("uses CRLF line endings and a trailing CRLF", () => {
    const csv = transactionsToCsv([tx()]);
    expect(csv.includes("\r\n")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "").includes("\n")).toBe(false); // no bare LF rows
  });

  it("header column order matches CSV_COLUMNS", () => {
    expect(rows(transactionsToCsv([]))[0]).toEqual([...CSV_COLUMNS]);
  });
});

describe("transactionsToCsv — columns", () => {
  it("renders an incoming amount unsigned and an outgoing amount with a leading minus", () => {
    const receive = rows(transactionsToCsv([tx({ type: "receive" })]))[1];
    expect(receive[COL["Amount (CCX)"]]).toBe("50.000000");
    expect(receive[COL["Amount (atomic)"]]).toBe("50000000");
    expect(receive[COL.Direction]).toBe("Incoming");

    const send = rows(transactionsToCsv([tx({ type: "send" })]))[1];
    expect(send[COL["Amount (CCX)"]]).toBe("-50.000000");
    expect(send[COL["Amount (atomic)"]]).toBe("-50000000");
    expect(send[COL.Direction]).toBe("Outgoing");
  });

  it("keeps a negative amount numeric (NOT formula-guarded)", () => {
    const send = rows(transactionsToCsv([tx({ type: "send" })]))[1];
    expect(send[COL["Amount (CCX)"]]).not.toMatch(/^'/);
    expect(send[COL["Amount (atomic)"]]).not.toMatch(/^'/);
  });

  it("maps confirmations to status at the 10-confirmation threshold", () => {
    expect(rows(transactionsToCsv([tx({ confirmations: 10 })]))[1][COL.Status]).toBe("Confirmed");
    expect(rows(transactionsToCsv([tx({ confirmations: 9 })]))[1][COL.Status]).toBe("Pending");
  });

  it("formats the date as ISO-8601 UTC", () => {
    expect(rows(transactionsToCsv([tx()]))[1][COL.Date]).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("transactionsToCsv — RFC 4180 quoting", () => {
  it("quotes commas/quotes/newlines and doubles embedded quotes", () => {
    const csv = transactionsToCsv([tx({ message: 'say "hi", ok\nbye' })]);
    expect(csv).toContain('"say ""hi"", ok\nbye"');
    // round-trips back to the original via the parser
    expect(rows(csv)[1][COL.Message]).toBe('say "hi", ok\nbye');
  });
});

describe("transactionsToCsv — formula injection (CWE-1236)", () => {
  const payloads = ['=cmd|"/c calc"!A1', "+1+1", "-1+1", "@SUM(A1:A2)", "\t=1", "\r=1", " =1+1"];

  for (const payload of payloads) {
    it(`neutralizes message payload ${JSON.stringify(payload)}`, () => {
      const cell = rows(transactionsToCsv([tx({ message: payload })]))[1][COL.Message];
      expect(cell.startsWith("'")).toBe(true);
    });
  }

  it("neutralizes a payment ID starting with a trigger", () => {
    const cell = rows(transactionsToCsv([tx({ paymentId: "=danger" })]))[1][COL["Payment ID"]];
    expect(cell).toBe("'=danger");
  });

  it("does NOT prefix benign fields", () => {
    const row = rows(transactionsToCsv([tx({ message: "50% off", address: "ccx7abc" })]))[1];
    expect(row[COL.Message]).toBe("50% off");
    expect(row[COL.Address]).toBe("ccx7abc");
  });
});

describe("transactionsToCsv — purity", () => {
  it("does not mutate the input", () => {
    const input = [tx({ type: "send", message: "=evil" })];
    const snapshot = structuredClone(input);
    transactionsToCsv(input);
    expect(input).toEqual(snapshot);
  });
});
