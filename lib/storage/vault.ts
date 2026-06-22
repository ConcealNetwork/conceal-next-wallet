import { txNotes } from "@/lib/storage/tx-notes";
import { decryptVault, type EncryptedVault, encryptVault } from "@/lib/storage/vault-crypto";

/**
 * Device-local data vault: an encrypted, portable backup of the metadata that
 * lives only on this device (and is identical in mock + real modes) — so a user
 * can move it to another browser without re-importing the seed. Deliberately
 * excludes wallet keys (use the wallet export), biometric enrollment
 * (device/credential-bound), and per-wallet engine settings.
 */

const VAULT_VERSION = 1;

/** Safe-to-migrate UI preferences (localStorage). Allowlist — never a blind dump. */
const VAULT_PREF_KEYS = ["useShortTicker", "ccx-theme", "ccx-locale"] as const;

export interface VaultData {
  version: number;
  exportedAt: string;
  prefs: Record<string, string>;
  txNotes: Record<string, string>;
}

export interface VaultFile {
  app: "conceal-next-wallet";
  kind: "local-data-vault";
  encrypted: EncryptedVault;
}

function readPrefs(): Record<string, string> {
  const prefs: Record<string, string> = {};
  if (typeof localStorage === "undefined") return prefs;
  for (const key of VAULT_PREF_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) prefs[key] = value;
  }
  return prefs;
}

function writePrefs(prefs: Record<string, string>): number {
  if (typeof localStorage === "undefined") return 0;
  let written = 0;
  for (const key of VAULT_PREF_KEYS) {
    const value = prefs[key];
    if (typeof value === "string") {
      localStorage.setItem(key, value);
      written += 1;
    }
  }
  return written;
}

/** Snapshot the current device-local data. `exportedAt` is supplied by the caller. */
async function collectVaultData(exportedAt: string): Promise<VaultData> {
  return {
    version: VAULT_VERSION,
    exportedAt,
    prefs: readPrefs(),
    txNotes: await txNotes.exportNotes(),
  };
}

/** Collect + password-encrypt into the on-disk file shape. */
export async function buildVaultFile(password: string, exportedAt: string): Promise<VaultFile> {
  const data = await collectVaultData(exportedAt);
  return {
    app: "conceal-next-wallet",
    kind: "local-data-vault",
    encrypted: await encryptVault(JSON.stringify(data), password),
  };
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

/** Parse + shape-validate an uploaded file before any decryption is attempted. */
export function parseVaultFile(json: string): VaultFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file isn't a valid backup (not JSON).");
  }
  const file = parsed as Partial<VaultFile>;
  if (file?.app !== "conceal-next-wallet" || file.kind !== "local-data-vault" || !file.encrypted) {
    throw new Error("That file isn't a Conceal local-data backup.");
  }
  return file as VaultFile;
}

/** Decrypt + validate the payload. Throws a friendly error on bad password / shape / version. */
export async function openVaultFile(file: VaultFile, password: string): Promise<VaultData> {
  const json = await decryptVault(file.encrypted, password);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Backup contents are corrupt.");
  }
  const candidate = data as Partial<VaultData>;
  if (
    typeof candidate?.version !== "number" ||
    !isRecordOfStrings(candidate.prefs) ||
    !isRecordOfStrings(candidate.txNotes)
  ) {
    throw new Error("Backup contents are not in a recognized format.");
  }
  if (candidate.version > VAULT_VERSION) {
    throw new Error("This backup was made by a newer version of the wallet — please update first.");
  }
  return {
    version: candidate.version,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
    prefs: candidate.prefs,
    txNotes: candidate.txNotes,
  };
}

/**
 * Apply restored data. `mergeNotes` keeps existing notes (only adds new hashes);
 * otherwise existing notes are replaced. Prefs are always overwritten from the
 * backup. Returns how many notes/prefs were written.
 */
export async function restoreVaultData(
  data: VaultData,
  opts: { mergeNotes: boolean },
): Promise<{ notes: number; prefs: number }> {
  const prefs = writePrefs(data.prefs ?? {});
  const notes = await txNotes.importNotes(
    data.txNotes ?? {},
    opts.mergeNotes ? "merge" : "replace",
  );
  return { notes, prefs };
}
