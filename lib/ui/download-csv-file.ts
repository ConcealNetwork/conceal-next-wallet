// UTF-8 BOM — added as its own Blob part (not concatenated into the serializer
// output) so the serializer stays BOM-free and easy to unit-test. Excel needs the
// BOM to decode UTF-8 correctly.
const CSV_BOM = "﻿";

/** Filename like `conceal-transactions-sent-2026-06-16.csv` (filter slug omitted for "All"). */
export function transactionCsvFilename(activeFilter = "All", now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const slug = activeFilter && activeFilter !== "All" ? `-${activeFilter.toLowerCase()}` : "";
  return `conceal-transactions${slug}-${date}.csv`;
}

export function downloadCsvFile(filename: string, csv: string): void {
  if (typeof window === "undefined") {
    throw new Error("Download is only available in the browser.");
  }

  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob([CSV_BOM, csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
