import type { ExportWalletData } from "@/lib/services/wallet.service";

/** Markdown backup block for clipboard export (Export page). */
export function formatWalletBackupMarkdown(data: ExportWalletData): string {
  return `# CONCEAL WALLET
## Public address:
\`\`\`
${data.address.trim()}
\`\`\`
## Creation Height
\`\`\`
${data.creationHeight}
\`\`\`
## mnemonic phrase
\`\`\`
${data.mnemonic.trim()}
\`\`\`
## View Key
\`\`\`
${data.viewKey.trim()}
\`\`\`
## SpendKey
\`\`\`
${data.spendKey.trim()}
\`\`\`
`;
}
