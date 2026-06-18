import {
  type EncryptedWalletEnvelope,
  encodeAddress,
  openEncryptedWallet,
  type RawWalletV1,
  saveEncryptedWallet,
  userKeysFromPriv,
} from "conceal-wallet-sdk";
import {
  buildFromMnemonic,
  buildFromSpendKey,
  buildNewWallet,
  buildViewOnly,
  type BuiltWallet,
  mnemonicFromSpendKey,
} from "@/lib/services/real-sdk/wallet-build";
import { mapWalletInfo } from "@/lib/services/real-sdk/mappers";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import {
  adopt,
  buildDaemon,
  disconnect as disconnectRuntime,
  friendlyMessage,
  getRuntime,
  hasStoredWallet as runtimeHasStoredWallet,
  nodeUrlFromRaw,
  persist,
  removeStoredWallet,
  requireRuntime,
  sync,
  unlock as unlockRuntime,
} from "@/lib/services/real-sdk/runtime";
import { getSdkWalletStorage } from "@/lib/services/real-sdk/storage";
import type {
  DownloadWalletBackupInput,
  ExportWalletData,
  FinalizeCreateWalletInput,
  ImportWalletInput,
  PreviewKeysInput,
  WalletService,
} from "@/lib/services/wallet.service";
import type { WalletInfo } from "@/lib/types";
import { backupDownloadFilename } from "@/lib/ui/download-json-file";

/** In-flight create draft (between `prepareCreateWallet` and `finalizeCreateWallet`). */
let pendingDraft: BuiltWallet | null = null;
/** Mnemonic for the just-created/restored wallet, surfaced once for the export screen. */
let createdMnemonic: string | null = null;

/** Long hex runs in an error likely carry key material — never surface them. */
const SENSITIVE_ERROR_PATTERN = /[0-9a-fA-F]{32,}/;

/** Map any import failure to a user-safe Error (drop messages that could leak keys). */
function toFriendlyImportError(error: unknown): Error {
  const message = friendlyMessage(error);
  if (message && !SENSITIVE_ERROR_PATTERN.test(message)) {
    return new Error(message);
  }
  return new Error("Couldn't import this wallet — double-check the details and try again.");
}

/** Sync the open runtime once and return the mapped {@link WalletInfo}. */
async function syncedInfo(): Promise<WalletInfo> {
  const networkHeight = await sync();
  return mapWalletInfo(requireRuntime(), networkHeight);
}

/** A best-effort current network height for a clamp (falls back to a large bound). */
async function safeNetworkHeight(): Promise<number> {
  const rt = getRuntime();
  try {
    const daemon = rt ? rt.daemon : buildDaemon(nodeUrlFromRaw(freshOptionsRaw()));
    return await daemon.getHeight();
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export const realSdkWalletService: WalletService = {
  async getWalletInfo(): Promise<WalletInfo> {
    await ensureSdkReady();
    return syncedInfo();
  },

  async refreshWallet(): Promise<WalletInfo> {
    await ensureSdkReady();
    return syncedInfo();
  },

  async hasStoredWallet(): Promise<boolean> {
    await ensureSdkReady();
    return runtimeHasStoredWallet();
  },

  async openWallet(input): Promise<WalletInfo> {
    await ensureSdkReady();
    if (!input?.password) {
      throw new Error("Password is required to open a stored wallet.");
    }
    createdMnemonic = null;
    await unlockRuntime(input.password);
    return syncedInfo();
  },

  async prepareCreateWallet() {
    await ensureSdkReady();
    // Seed the draft at the current tip so a new wallet doesn't rescan history.
    let creationHeight = 0;
    try {
      creationHeight = await buildDaemon(nodeUrlFromRaw(freshOptionsRaw())).getHeight();
    } catch {
      creationHeight = 0;
    }
    pendingDraft = buildNewWallet(creationHeight);
    return {
      mnemonic: pendingDraft.mnemonic ?? "",
      address: pendingDraft.address,
    };
  },

  async finalizeCreateWallet(input: FinalizeCreateWalletInput): Promise<WalletInfo> {
    await ensureSdkReady();
    if (pendingDraft === null) {
      throw new Error("No wallet draft found. Start creation again.");
    }
    if (!input.password) {
      throw new Error("Password is required to finalize wallet creation.");
    }
    const draft = pendingDraft;
    pendingDraft = null;
    createdMnemonic = draft.mnemonic ?? null;
    await adopt({ raw: draft.raw, keys: draft.keys, password: input.password });
    return syncedInfo();
  },

  async abortCreateWallet() {
    pendingDraft = null;
  },

  async deleteStoredWallet() {
    await ensureSdkReady();
    await disconnectRuntime();
    await removeStoredWallet();
    createdMnemonic = null;
  },

  async panicWipe() {
    await ensureSdkReady();
    // Lock first (no flush) so nothing re-persists after the erase, then remove
    // the stored record. The SDK engine runs no workers/timers to terminate.
    await disconnectRuntime();
    try {
      await removeStoredWallet();
    } catch (error) {
      throw new Error(
        `Panic wipe did not complete — some local data may remain. ${friendlyMessage(error)}`,
      );
    }
    createdMnemonic = null;
  },

  async importWallet(input: ImportWalletInput): Promise<WalletInfo> {
    await ensureSdkReady();
    createdMnemonic = null;
    if (input.method === "open") {
      await unlockRuntime(input.password);
      return syncedInfo();
    }

    try {
      const creationHeight = await importCreationHeight(input);
      let built: BuiltWallet;
      switch (input.method) {
        case "mnemonic":
          built = buildFromMnemonic(
            input.mnemonic,
            creationHeight,
            input.language === "auto" ? undefined : input.language,
          );
          createdMnemonic = built.mnemonic ?? null;
          break;
        case "keys":
          built = input.viewOnly
            ? buildViewOnly(input.address, input.privateViewKey, creationHeight)
            : buildFromSpendKey(input.privateSpendKey, input.privateViewKey, creationHeight);
          break;
        default:
          throw new Error("This import method is not supported by the SDK engine.");
      }
      await adopt({ raw: built.raw, keys: built.keys, password: input.password });
      return syncedInfo();
    } catch (error) {
      throw toFriendlyImportError(error);
    }
  },

  async previewKeys(input: PreviewKeysInput) {
    await ensureSdkReady();
    const spend = input.spendKey.trim();
    let view = (input.viewKey ?? "").trim();
    if (view === "") {
      const { crypto } = await import("conceal-wallet-sdk");
      view = crypto.generateKeys(crypto.cnFastHash(spend)).sec;
    }
    const keys = userKeysFromPriv(spend, view);
    return { address: encodeAddress(keys.pub.spend, keys.pub.view), viewKey: view };
  },

  async exportWallet(): Promise<ExportWalletData> {
    await ensureSdkReady();
    const rt = requireRuntime();
    if (rt.viewOnly) {
      // A view-only wallet has no spend secret / mnemonic to export.
      return {
        address: rt.account.address,
        mnemonic: "",
        spendKey: "",
        viewKey: rt.account.keys.view.sec,
        creationHeight: Math.max(0, Number(rt.raw.creationHeight ?? 0) || 0),
      };
    }
    const spendKey = rt.account.keys.spend.sec;
    const mnemonic = createdMnemonic || mnemonicFromSpendKey(spendKey);
    return {
      address: rt.account.address,
      mnemonic,
      spendKey,
      viewKey: rt.account.keys.view.sec,
      creationHeight: Math.max(0, Number(rt.raw.creationHeight ?? 0) || 0),
    };
  },

  async exportWalletPdf() {
    const data = await this.exportWallet();
    const { downloadWalletExportPdf } = await import("@/lib/ui/wallet-export-pdf");
    const filename = await downloadWalletExportPdf(data);
    return { filename };
  },

  async downloadWalletBackup(input: DownloadWalletBackupInput) {
    await ensureSdkReady();
    const rt = requireRuntime();
    if (!input.password) {
      throw new Error("Password is required to download a backup.");
    }
    // Verify the supplied password decrypts the stored wallet before exporting.
    const ok = await this.verifyPassword(input.password);
    if (!ok) {
      throw new Error("Invalid password.");
    }
    // Persist the latest in-memory state, then encrypt the current blob with the
    // verified password — the payload IS the new-format encrypted envelope.
    await persist();
    const envelope = saveEncryptedWallet(rt.raw, input.password);
    return {
      filename: backupDownloadFilename(input.filename),
      payload: envelope,
    };
  },

  async changePassword(input) {
    await ensureSdkReady();
    const rt = requireRuntime();
    if (!input.currentPassword || !input.newPassword) {
      throw new Error("Both the current and new password are required.");
    }
    const ok = await this.verifyPassword(input.currentPassword);
    if (!ok) {
      throw new Error("Current password is incorrect.");
    }
    rt.password = input.newPassword;
    await persist();
    return { ok: true as const };
  },

  async verifyPassword(password) {
    await ensureSdkReady();
    if (!password) return false;
    const stored = await getSdkWalletStorage().getItem("wallet");
    if (stored === null) return false;
    let envelope: EncryptedWalletEnvelope;
    try {
      envelope = JSON.parse(stored) as EncryptedWalletEnvelope;
    } catch {
      return false;
    }
    try {
      return openEncryptedWallet(envelope, password) !== null;
    } catch {
      return false;
    }
  },

  async disconnect() {
    pendingDraft = null;
    createdMnemonic = null;
    await disconnectRuntime();
  },
};

/** A minimal blob carrying default options — used only to resolve the default node URL. */
function freshOptionsRaw(): RawWalletV1 {
  const rt = getRuntime();
  if (rt) return rt.raw;
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
    options: { customNode: false, nodeUrl: "" },
  };
}

/** Clamp a requested import scan height to `[0, networkHeight]`. */
async function importCreationHeight(input: ImportWalletInput): Promise<number> {
  const requested =
    "scanHeight" in input && typeof input.scanHeight === "number" ? input.scanHeight : undefined;
  if (requested === undefined) {
    // Default to the current tip (a fresh import starts scanning from "now").
    try {
      return await buildDaemon(nodeUrlFromRaw(freshOptionsRaw())).getHeight();
    } catch {
      return 0;
    }
  }
  if (requested < 0) return 0;
  const tip = await safeNetworkHeight();
  return Math.min(requested, tip);
}
