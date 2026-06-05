import { publicAssetPath } from "@/lib/conceal/asset-path";
import { ensureWalletExtendedLibs } from "@/lib/conceal/init";
import type { ExportWalletData } from "@/lib/services/wallet.service";
import { formatWalletBackupMarkdown } from "@/lib/ui/wallet-export-backup";

const JSPDF_SCRIPT = "/lib/jspdf.min.js";
const PDF_FILENAME = "conceal-wallet-backup.pdf";

/** Theme primary is hsl(39 100% 50%) — use a very light tint for print-friendly headers. */
const PDF_THEME = {
  headerFill: [255, 245, 232] as const,
  headerBorder: [255, 196, 120] as const,
  headerText: [40, 32, 24] as const,
  bodyText: [20, 20, 20] as const,
  mutedText: [90, 90, 90] as const,
  sectionRule: [220, 220, 220] as const,
} as const;

let jsPdfLoadPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-wallet-lib="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = publicAssetPath(src);
    script.async = false;
    script.dataset.walletLib = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load wallet script: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureJsPdf(): Promise<void> {
  if (typeof jsPDF !== "undefined") {
    return;
  }

  if (!jsPdfLoadPromise) {
    jsPdfLoadPromise = loadScript(JSPDF_SCRIPT);
  }

  await jsPdfLoadPromise;

  if (typeof jsPDF === "undefined") {
    throw new Error("jsPDF is not available.");
  }
}

/** Legacy jsPDF (public/lib/jspdf.min.js) exposes width/height getters, not getWidth(). */
function getPdfPageDimensions(doc: InstanceType<typeof jsPDF>): { width: number; height: number } {
  const pageSize = doc.internal.pageSize as {
    width?: number;
    height?: number;
    getWidth?: () => number;
    getHeight?: () => number;
  };

  if (typeof pageSize.width === "number" && typeof pageSize.height === "number") {
    return { width: pageSize.width, height: pageSize.height };
  }

  if (typeof pageSize.getWidth === "function" && typeof pageSize.getHeight === "function") {
    return { width: pageSize.getWidth(), height: pageSize.getHeight() };
  }

  return { width: 210, height: 297 };
}

function createPdfDocument(): InstanceType<typeof jsPDF> {
  return new jsPDF("portrait", "mm", "a4");
}

function renderQrCanvas(text: string, size: number, ecLevel?: string): HTMLCanvasElement {
  const rendered = kjua({
    render: "canvas",
    text,
    size,
    ...(ecLevel ? { ecLevel } : {}),
  });

  if (typeof rendered === "string" || rendered instanceof HTMLImageElement) {
    throw new Error("Expected kjua to return a canvas.");
  }

  return rendered;
}

function writeSection(
  doc: InstanceType<typeof jsPDF>,
  margin: number,
  pageWidth: number,
  yStart: number,
  title: string,
  body: string,
): number {
  let y = yStart;
  const contentWidth = pageWidth - margin * 2;

  doc.setDrawColor(...PDF_THEME.sectionRule);
  doc.setLineWidth(0.2);
  doc.line(margin, y - 2, pageWidth - margin, y - 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_THEME.bodyText);
  doc.text(title, margin, y);
  y += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(body.trim(), contentWidth) as string[];
  doc.text(lines, margin, y);
  return y + lines.length * 4.2 + 5;
}

function drawPrintHeader(doc: InstanceType<typeof jsPDF>, pageWidth: number, margin: number): number {
  const headerHeight = 16;

  doc.setFillColor(...PDF_THEME.headerFill);
  doc.rect(0, 0, pageWidth, headerHeight, "F");
  doc.setDrawColor(...PDF_THEME.headerBorder);
  doc.setLineWidth(0.35);
  doc.line(0, headerHeight, pageWidth, headerHeight);

  doc.setTextColor(...PDF_THEME.headerText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("CONCEAL WALLET", margin, 10.5);

  return headerHeight + 10;
}

/** Build and download a PDF backup (markdown-style keys + receive/import QR codes). */
export async function downloadWalletExportPdf(data: ExportWalletData): Promise<string> {
  await ensureWalletExtendedLibs();
  await ensureJsPdf();

  const { CoinUri } = await import("@/lib/wallet-core/CoinUri");
  const importUri = CoinUri.encodeWalletKeys(
    data.address,
    data.spendKey,
    data.viewKey,
    data.creationHeight,
  );

  const addressQr = renderQrCanvas(data.address, 336);
  const importQr = renderQrCanvas(importUri, 336, "M");

  const doc = createPdfDocument();
  const margin = 14;
  const { width: pageWidth, height: pageHeight } = getPdfPageDimensions(doc);

  let y = drawPrintHeader(doc, pageWidth, margin);
  doc.setTextColor(...PDF_THEME.bodyText);

  const markdown = formatWalletBackupMarkdown(data);
  const mnemonicMatch = markdown.match(/## mnemonic phrase\s+```\s*([\s\S]*?)```/);
  const viewMatch = markdown.match(/## View Key\s+```\s*([\s\S]*?)```/);
  const spendMatch = markdown.match(/## SpendKey\s+```\s*([\s\S]*?)```/);

  y = writeSection(
    doc,
    margin,
    pageWidth,
    y,
    "mnemonic phrase",
    mnemonicMatch?.[1] ?? data.mnemonic,
  );
  y = writeSection(doc, margin, pageWidth, y, "View Key", viewMatch?.[1] ?? data.viewKey);
  y = writeSection(doc, margin, pageWidth, y, "SpendKey", spendMatch?.[1] ?? data.spendKey);

  const qrSize = 50.4;
  const qrGap = 16;
  const qrY = y + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_THEME.bodyText);
  doc.text("Public address", margin, qrY);
  doc.text("Import wallet", margin + qrSize + qrGap, qrY);

  doc.addImage(addressQr.toDataURL("image/png"), "PNG", margin, qrY + 3, qrSize, qrSize);
  doc.addImage(
    importQr.toDataURL("image/png"),
    "PNG",
    margin + qrSize + qrGap,
    qrY + 3,
    qrSize,
    qrSize,
  );

  let captionY = qrY + qrSize + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_THEME.mutedText);
  doc.text("Scan to receive CCX", margin, captionY);
  doc.text("Scan in wallet import (QR)", margin + qrSize + qrGap, captionY);

  captionY += 4;
  doc.setTextColor(...PDF_THEME.bodyText);
  const addressLines = doc.splitTextToSize(data.address, qrSize + 8) as string[];
  doc.text(addressLines, margin, captionY);

  const warningY = Math.min(pageHeight - 12, captionY + addressLines.length * 3.5 + 10);
  doc.setDrawColor(...PDF_THEME.sectionRule);
  doc.setLineWidth(0.2);
  doc.line(margin, warningY - 4, pageWidth - margin, warningY - 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_THEME.mutedText);
  doc.text("Keep this document offline. Anyone with these keys can spend your funds.", margin, warningY);

  doc.save(PDF_FILENAME);
  return PDF_FILENAME;
}

export { PDF_FILENAME as walletExportPdfFilename };
