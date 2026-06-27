/**
 * Pure per-transaction scan — the expensive, PARALLELIZABLE half of folding (a per-tx ECDH via
 * `scanTransactionOutputsAndDeposits`, ~600µs/tx). Shared verbatim by the in-thread fold
 * (`runtime.ts`) and the scan Web Worker (`scan-worker.ts`), so a worker result is byte-identical
 * to an in-thread one (same WASM, same inputs). The state-dependent APPLY
 * (`applyScannedTransaction`/`applyScannedDeposits`, which needs the running `WalletState`) stays
 * sequential on the main thread — only this read-only scan is offloaded.
 *
 * No module-level engine state; the only engine dependency is the WASM-backed
 * `transactions.scanTransactionOutputsAndDeposits`, which the caller must have initialized
 * (`ensureSdkReady`) first.
 */
import { type RawDepositInput, transactions as txns, type WalletKeys } from "conceal-wallet-sdk";

/**
 * Minimal daemon raw-transaction shape consumed by the scanner — mirrored from the SDK's
 * (unexported) `DaemonRawTransaction`. Kept here so both the worker and runtime share one type.
 */
export interface DaemonRawTransaction {
  transaction: unknown;
  timestamp: number;
  // Optional: although the SDK's `mapRawTransaction` populates these for a well-formed daemon
  // response, they are external-boundary data — guard before use rather than assume present.
  outputIndexes?: number[];
  height?: number;
  hash?: string;
  blockHash: string;
  fee: number;
}

type ScannedOutputs = ReturnType<typeof txns.scanTransactionOutputsAndDeposits>;

/**
 * The result of scanning ONE raw tx: everything `foldTransaction` needs before the state-dependent
 * apply. JSON-serializable end-to-end (it crosses a `postMessage` boundary from the worker).
 * `null` when the daemon slot has no usable `extra`/`vout`.
 */
export interface RawScanResult {
  /** The parsed scan transaction (carries hash/height; reused for message reconstruction). */
  scanTx: txns.RawTransaction;
  /** Daemon inner `transaction` object (vin/vout for fusion/coinbase classification at fold). */
  rawTransaction: unknown;
  /** Transaction fee in atomic units, when the daemon supplied one. */
  fee: number;
  /** Outputs/deposits owned by the wallet (the ECDH scan result). */
  ownedOutputs: ScannedOutputs["outputs"];
  ownedDeposits: ScannedOutputs["deposits"];
  /** Spent-input key images + type-03 deposit inputs (cheap JSON parse, bundled in). */
  inputKeyImages: string[];
  depositInputs: RawDepositInput[];
  /** The tx timestamp (carried so the apply/message step needs only this result). */
  timestamp: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Daemon `transaction` → the SDK scanner's {@link txns.RawTransaction}, or `null`. */
export function toScanTransaction(rawTx: DaemonRawTransaction): txns.RawTransaction | null {
  const inner = rawTx.transaction;
  if (!isRecord(inner)) return null;

  const extra = normalizeExtra(inner.extra);
  if (extra === null) return null;
  const vout = normalizeVout(inner.vout);
  if (vout === null) return null;

  return {
    extra,
    vout,
    ...(rawTx.outputIndexes?.length ? { outputIndexes: rawTx.outputIndexes } : {}),
    ...(rawTx.hash ? { hash: rawTx.hash } : {}),
    ...(typeof rawTx.height === "number" ? { height: rawTx.height } : {}),
  };
}

function normalizeExtra(extra: unknown): string | null {
  if (typeof extra === "string") return extra;
  if (Array.isArray(extra)) {
    let hex = "";
    for (const byte of extra) {
      if (typeof byte !== "number" || byte < 0 || byte > 255) return null;
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  }
  return null;
}

function normalizeVout(vout: unknown): txns.RawTransactionOutput[] | null {
  if (!Array.isArray(vout)) return null;
  const outputs: txns.RawTransactionOutput[] = [];
  for (const out of vout) {
    if (!isRecord(out)) return null;
    const target = out.target;
    if (!isRecord(target)) return null;
    const type = target.type;
    const data = target.data;
    if (typeof type !== "string" || !isRecord(data)) return null;
    outputs.push({
      amount: typeof out.amount === "number" ? out.amount : 0,
      target: {
        type,
        data: {
          ...(typeof data.key === "string" ? { key: data.key } : {}),
          ...(Array.isArray(data.keys)
            ? { keys: data.keys.filter((k): k is string => typeof k === "string") }
            : {}),
          ...(typeof data.term === "number" ? { term: data.term } : {}),
        },
      },
    });
  }
  return outputs;
}

function extractInputKeyImages(transaction: unknown): string[] {
  if (!isRecord(transaction)) return [];
  const vin = transaction.vin;
  if (!Array.isArray(vin)) return [];
  const keyImages: string[] = [];
  for (const input of vin) {
    if (!isRecord(input)) continue;
    const direct = input.k_image;
    if (typeof direct === "string" && direct.length > 0) {
      keyImages.push(direct);
      continue;
    }
    const value = input.value;
    if (isRecord(value) && typeof value.k_image === "string" && value.k_image.length > 0) {
      keyImages.push(value.k_image);
    }
  }
  return keyImages;
}

function extractDepositInputs(transaction: unknown): RawDepositInput[] {
  if (!isRecord(transaction)) return [];
  const vin = transaction.vin;
  if (!Array.isArray(vin)) return [];
  const deposits: RawDepositInput[] = [];
  for (const input of vin) {
    if (!isRecord(input)) continue;
    const source = isRecord(input.value) ? input.value : input;
    const type = input.type ?? source.type;
    if (type !== "input_to_deposit_key" && type !== "03") continue;
    const outputIndex = source.outputIndex;
    const term = source.term;
    deposits.push({
      type: "input_to_deposit_key",
      ...(typeof outputIndex === "number" ? { outputIndex } : {}),
      ...(typeof term === "number" ? { term } : {}),
    });
  }
  return deposits;
}

/**
 * Scan ONE raw daemon tx for owned outputs/deposits + spent inputs — the per-tx ECDH work, with no
 * dependency on wallet state, so it is safe to run in parallel (in a Web Worker). Returns `null`
 * when the slot has no usable transaction (the caller skips it). Deterministic: identical
 * `(rawTx, keys)` always yield an identical result, in-thread or in a worker.
 */
export function scanRawTransaction(
  rawTx: DaemonRawTransaction,
  keys: WalletKeys,
): RawScanResult | null {
  const inner = rawTx.transaction;
  if (!inner || typeof inner !== "object") return null;

  const scanTx = toScanTransaction(rawTx);
  if (scanTx === null) return null;

  const { outputs: ownedOutputs, deposits: ownedDeposits } = txns.scanTransactionOutputsAndDeposits(
    scanTx,
    keys,
  );
  return {
    scanTx,
    rawTransaction: inner,
    fee: typeof rawTx.fee === "number" ? rawTx.fee : 0,
    ownedOutputs,
    ownedDeposits,
    inputKeyImages: extractInputKeyImages(inner),
    depositInputs: extractDepositInputs(inner),
    timestamp: rawTx.timestamp,
  };
}
