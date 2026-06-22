import { triggerBlobDownload } from "@/lib/ui/download-blob";

// UTF-8 BOM — added as its own Blob part (not concatenated into the serializer
// output) so the serializer stays BOM-free and easy to unit-test. Excel needs the
// BOM to decode UTF-8 correctly.
const CSV_BOM = "﻿";

/** Filename like `conceal-transactions-sent-2026-06-16.csv` (filter slug omitted for "All"). */
export function transactionCsvFilename(activeFilter = "All", now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  // Sanitize to [a-z0-9-] so a future multi-word tab label can't break the filename.
  const cleaned = activeFilter
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = cleaned && cleaned !== "all" ? `-${cleaned}` : "";
  return `conceal-transactions${slug}-${date}.csv`;
}

export function downloadCsvFile(filename: string, csv: string): void {
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob([CSV_BOM, csv], { type: "text/csv;charset=utf-8" });
  triggerBlobDownload(name, blob);
}
