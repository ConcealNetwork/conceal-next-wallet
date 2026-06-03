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
  exportAlertTitle: env.useMockWallet ? "Mock-only export data" : "Sensitive backup material",
  exportAlertBody: env.useMockWallet
    ? "Displayed values are placeholders for layout review only."
    : "Never share your mnemonic or private keys. Store backups offline.",
  passwordChanged: env.useMockWallet ? "Mock password changed." : "Wallet password updated.",
  sendConfirm: env.useMockWallet
    ? "Confirm this mock send? No transaction will be broadcast."
    : "Confirm and broadcast this transaction?",
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
} as const;

/** HTML `required` on import fields — relaxed in mock so you can click through quickly. */
export const importFieldsRequired = !env.useMockWallet;
