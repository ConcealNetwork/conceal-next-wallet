import { env } from "@/lib/env";

/** User-facing strings that differ between mock and real wallet builds. */
export const walletCopy = {
  importWallet: env.useMockWallet ? "Open Mock Wallet" : "Import Wallet",
  landingSubtitle: env.useMockWallet
    ? "Mock-only recreation of the Conceal CCX wallet interface."
    : "Browser wallet for Conceal CCX — keys stay encrypted on your device.",
  createWalletDescription: env.useMockWallet
    ? "This generates placeholder words only. No real keys are created."
    : "A new wallet will be encrypted and stored in this browser.",
  mnemonicTitle: env.useMockWallet ? "Placeholder mnemonic" : "Save your recovery phrase",
  mnemonicHint: env.useMockWallet
    ? "These words are not a real wallet seed."
    : "Write these words down and store them offline. Anyone with this phrase can spend your funds.",
  mnemonicLossWarning:
    "I understand that if I lose this seed phrase or the related keys, this wallet and its funds will be totally unretrievable.",
  mnemonicDoubleClickCopy: "Double-click to copy",
  mnemonicCopied: "Copied",
  passwordHintDisclaimer:
    "These are recommendations for a strong password. You may continue with any password that matches.",
  exportAlertTitle: env.useMockWallet ? "Mock-only export data" : "Sensitive backup material",
  exportAlertBody: env.useMockWallet
    ? "Displayed values are placeholders for layout review only."
    : "Never share your mnemonic or private keys. Store backups offline.",
  exportPageSubtitle: env.useMockWallet
    ? "Back up placeholder wallet material"
    : "Back up your encrypted wallet file or copy keys offline",
  downloadBackupDialogTitle: "Download encrypted backup",
  downloadBackupDialogDescription:
    "Choose a file name and confirm your wallet password. The file is encrypted with the same password used to unlock this wallet.",
  downloadBackupFilenameLabel: "File name",
  downloadBackupFilenameHint: 'Saved as "{filename}" in your downloads folder.',
  downloadBackupPasswordLabel: "Wallet password",
  downloadBackupSuccess: "Backup downloaded.",
  exportPdfSuccess: "PDF backup downloaded.",
  exportPdfButton: "Export as PDF",
  passwordChanged: env.useMockWallet ? "Mock password changed." : "Wallet password updated.",
  sendConfirm: env.useMockWallet
    ? "Confirm this mock send? No transaction will be broadcast."
    : "Confirm and broadcast this transaction?",
  sendToSelfFromLinkTitle: "Send to yourself?",
  sendToSelfFromLinkDescription:
    "This payment link points to your own wallet address. Are you sure you want to send to yourself?",
  sendSuccess: env.useMockWallet
    ? "Mock transaction submitted. No CCX was sent."
    : "Transaction submitted to the network.",
  depositCreateSuccess: env.useMockWallet
    ? "Mock deposit created."
    : "Deposit submitted to the network.",
  depositWithdrawSuccess: env.useMockWallet
    ? "Mock withdrawal started."
    : "Withdrawal submitted to the network.",
  depositCreateConfirm: env.useMockWallet
    ? "Confirm this mock deposit? No funds will be locked."
    : "Confirm and broadcast this deposit transaction?",
  depositWithdrawConfirm: env.useMockWallet
    ? "Confirm this mock withdrawal?"
    : "Confirm and broadcast this withdrawal? Principal plus interest will return to your wallet.",
  messageTtlDisclaimer:
    "TTL transactions only exist in the mempool and auto-destruct after the selected duration (hours:minutes). They are not mined into blocks, so the amount charged is returned to your wallet.",
  messageTooLong: "The message is too long. Maximum length is 260 characters.",
  messageSendSuccess: env.useMockWallet
    ? "Mock message sent."
    : "Message submitted to the network.",
  disconnectConfirm: env.useMockWallet
    ? "This clears the current mock wallet session and returns you to the open wallet screen."
    : "This locks the wallet and returns you to the open wallet screen. Your encrypted wallet stays on this device.",
  viewOnlyBadge: "View-only",
  viewOnlyBannerTitle: "View-only wallet",
  viewOnlyBannerBody:
    "Incoming transactions, deposits, and withdrawals are tracked. Regular sends are not shown — detecting spends requires the spend key or imported key images.",
  viewOnlySendDisabled: "This is a view-only wallet. Import the spend key to send CCX.",
  viewOnlyDepositDisabled:
    "This is a view-only wallet. Creating or withdrawing deposits requires the spend key.",
  viewOnlyMessageDisabled: "This is a view-only wallet. Import the spend key to send messages.",
  viewOnlyOptimizeDisabled:
    "This is a view-only wallet. Optimizing outputs requires the spend key.",
  exportCsvButton: "Export CSV",
  exportCsvEmpty: "No transactions to export.",
} as const;

/** HTML `required` on import fields — relaxed in mock so you can click through quickly. */
export const importFieldsRequired = !env.useMockWallet;
